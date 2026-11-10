// Space context menu: pin/unpin a space and open its folder in VS Code or the
// system file manager, alongside Herdr's rename/worktree/close items.
//
// Opened by `spaces-plus` with props { space: "<space id>" }.
//
// Works on its own: Pin space needs the `space-pin` placeholder mod (shown
// only while it is installed, or to unpin), and the worktree items open
// `worktree-plus` when installed, else Herdr's own `worktree` dialog.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, props, closeOverlay, openOverlay, theme, keys, spaces, panes, exec, hc, notify, shared, setShared, appHome, readTextFile, window } from "herdr";

// Where a space is now: pinned spaces keep their pinned location,
// while unpinned spaces follow their first terminal's live folder (else where made).
function place(space) {
  const pinned = (shared("spaces.pinned") ?? []).includes(space.id);
  if (pinned) {
    const loc = (shared("spaces.pinned_locations") ?? {})[space.id];
    if (loc) return loc;
  }
  const tabs = new Set((space.tabs ?? []).map((tab) => tab.id));
  return panes().find((pane) => tabs.has(pane.tab) && pane.cwd)?.cwd || space.folder;
}

// A space's checkout: "main" (a repo's own), "linked" (a worktree), or null.
async function checkout(folder, on) {
  const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: folder, on });
  const common = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: folder, on });
  if (top.code !== 0 || common.code !== 0) return null;
  return common.stdout.trim() === `${top.stdout.trim()}/.git` ? "main" : "linked";
}

/**
 * Whether a mod is installed in the live mods folder (its manifest exists).
 * @param {string} name mod folder name
 * @returns {Promise<boolean>}
 */
function installed(name) {
  return readTextFile(`${appHome()}/mods/${name}/mod.json`).then((text) => typeof text === "string").catch(() => false);
}

function hasPinTab(space) {
  const tabs = new Set((space.tabs ?? []).map((tab) => tab.id));
  return panes().some((pane) => pane.mod === "space-pin" && tabs.has(pane.tab));
}

// A pinned space keeps a `space-pin` tab so closing every terminal/agent does
// not take the space with it. Unpinning closes those placeholder tabs.
function togglePin(space, placeholder = true) {
  const ids = new Set(shared("spaces.pinned") ?? []);
  const locs = { ...(shared("spaces.pinned_locations") ?? {}) };
  const autoNamed = new Set(shared("spaces.pinned_auto_named") ?? []);
  if (ids.has(space.id)) {
    ids.delete(space.id);
    delete locs[space.id];
    const wasAutoNamed = autoNamed.has(space.id);
    autoNamed.delete(space.id);
    setShared("spaces.pinned", [...ids]);
    setShared("spaces.pinned_locations", locs);
    setShared("spaces.pinned_auto_named", [...autoNamed]);
    const tabs = new Set((space.tabs ?? []).map((tab) => tab.id));
    for (const pane of panes().filter((pane) => pane.mod === "space-pin" && tabs.has(pane.tab))) {
      run("tab.close", { id: pane.tab });
    }
    if (wasAutoNamed) {
      run("space.rename", { id: space.id, name: "" });
    }
    notify({ title: "Space unpinned", body: space.name, level: "info", timeout: 1800 });
    return;
  }
  const loc = place(space);
  ids.add(space.id);
  if (loc) locs[space.id] = loc;
  if (!space.named && space.name) {
    autoNamed.add(space.id);
    run("space.rename", { id: space.id, name: space.name });
  }
  setShared("spaces.pinned", [...ids]);
  setShared("spaces.pinned_locations", locs);
  setShared("spaces.pinned_auto_named", [...autoNamed]);
  if (placeholder && !hasPinTab(space)) {
    const activeSpace = spaces().find((candidate) => candidate.active)?.id;
    const activeTab = (space.tabs ?? []).find((tab) => tab.active)?.id;
    run("tab.new", { space: space.id, mod: "space-pin", name: "New tab", props: { space: space.id, folder: loc } });
    if (activeSpace) run("space.select", { id: activeSpace });
    if (activeTab) run("tab.select", { id: activeTab });
  }
  notify({ title: "Space pinned", body: space.name, level: "success", timeout: 1800 });
}

async function sshTarget(machine) {
  try {
    const result = await hc(["machine", "ls", "--json"]);
    if (result.code === 0) {
      const found = (JSON.parse(result.stdout).machines ?? []).find((entry) => entry.name === machine);
      if (found?.target) return found.target;
    }
  } catch {}
  return machine;
}

async function openVSCode(space) {
  const folder = place(space);
  if (!folder) {
    notify({ title: "Open in VS Code", body: "This space has no folder.", level: "warning" });
    return;
  }
  const host = space.machine ? await sshTarget(space.machine) : null;
  const args = host ? ["--remote", `ssh-remote+${host}`, "-n", folder] : ["-n", folder];
  try {
    const result = await exec("code", args);
    if (result.code !== 0) {
      notify({ title: "VS Code", body: (result.stderr || "").trim() || `exit ${result.code}`, level: "error" });
    }
  } catch {
    notify({ title: "VS Code not found", body: "Install the `code` command in PATH.", level: "error" });
  }
}

// The system file manager's label and the command that opens a folder in it.
const FILE_MANAGERS = {
  macos: { label: "Open in Finder", command: "open" },
  windows: { label: "Open in Explorer", command: "explorer" },
  linux: { label: "Open in File Manager", command: "xdg-open" },
};

function fileManager() {
  return FILE_MANAGERS[window()?.platform] ?? { label: "Open folder", command: "open" };
}

async function openFolder(space) {
  const folder = place(space);
  const { label, command } = fileManager();
  if (!folder) {
    notify({ title: label, body: "This space has no folder.", level: "warning" });
    return;
  }
  try {
    const result = await exec(command, [folder]);
    // explorer.exe exits 1 even when it opens the folder.
    if (result.code !== 0 && command !== "explorer") {
      notify({ title: label, body: (result.stderr || "").trim() || `exit ${result.code}`, level: "error" });
    }
  } catch {
    notify({ title: label, body: `Could not open ${folder}.`, level: "error" });
  }
}

function iconFor(item) {
  if (item.icon === "pin") return "mods/space-menu/pin.svg";
  if (item.icon === "code") return "mods/space-menu/vscode.svg";
  if (item.icon === "folder") return "mods/workspace-chrome/folder.svg";
  if (item.icon === "rename") return "mods/workspace-chrome/square-pen.svg";
  if (item.icon === "worktree") return "mods/workspace-chrome/git-branch.svg";
  if (item.icon === "close") return "mods/workspace-chrome/x.svg";
  return "mods/workspace-chrome/terminal.svg";
}

function shortcut(name, args) {
  const value = args && Object.values(args)[0];
  const binding = keys().find((entry) => entry.section === "global" && (entry.action === name || entry.action === `${name}:${value}`));
  return binding ? binding.keys : "";
}

function items(space, git, pinned, canPin = true) {
  // The worktree dialog reads `folder` before anything else: pass the space's
  // own place (pinned location first) so it never falls back to another repo.
  const folder = place(space);
  return [
    ...(pinned || canPin ? [{ label: pinned ? "Unpin space" : "Pin space", command: "space.pin", icon: "pin", hint: pinned ? "pinned" : "" }] : []),
    { label: "Open in VS Code", command: "space.vscode", icon: "code" },
    // A remote space's folder lives on another machine: there is nothing local
    // for Finder/Explorer to show.
    ...(space.machine ? [] : [{ label: fileManager().label, command: "space.folder", icon: "folder" }]),
    { sep: true },
    { label: "Rename", command: "space.rename", args: { id: space.id }, icon: "rename" },
    ...(git ? [
      { label: "New worktree", command: "worktree", args: { space: space.id, folder, action: "new" }, icon: "worktree" },
      { label: "Open worktree", command: "worktree", args: { space: space.id, folder, action: "open" }, icon: "worktree" },
    ] : []),
    ...(git === "linked" ? [
      { label: "Remove worktree", command: "worktree", args: { space: space.id, folder, action: "remove" }, icon: "worktree" },
    ] : []),
    { sep: true },
    { label: "Close", command: "space.close", args: { id: space.id }, icon: "close" },
  ];
}

export default class SpaceMenu extends View {
  init(_props, cx) {
    this.at = 0;
    this.git = null;
    /** @type {Record<string, boolean>} optional mods: space-pin, worktree-plus */
    this.mods = {};
    cx.spawn(async (cx) => {
      const [pin, worktree] = await Promise.all([installed("space-pin"), installed("worktree-plus")]);
      this.mods = { "space-pin": pin, "worktree-plus": worktree };
      cx.notify();
    });
    this.handle = cx.focus_handle();
    this.handle.focus();
    const space = this.space();
    const folder = space && place(space);
    if (folder) {
      cx.spawn(async (cx) => {
        this.git = await checkout(folder, space.machine).catch(() => null);
        cx.notify();
      });
    }
  }

  space() {
    const id = props()?.space;
    return id ? spaces().find((candidate) => candidate.id === id) ?? null : spaces().find((candidate) => candidate.active) ?? null;
  }

  list() {
    const space = this.space();
    if (!space) return [];
    const pinned = (shared("spaces.pinned") ?? []).includes(space.id);
    return items(space, this.git, pinned, Boolean(this.mods["space-pin"]));
  }

  move(delta) {
    const list = this.list();
    if (!list.length) return;
    let at = this.at;
    for (let n = 0; n < list.length; n++) {
      at = (at + delta + list.length) % list.length;
      if (!list[at].sep) break;
    }
    this.at = at;
  }

  choose() {
    const list = this.list();
    const item = list[this.at];
    const space = this.space();
    if (!item || item.sep || !space) {
      closeOverlay(props()?.overlay);
      return;
    }
    if (item.command === "space.pin") {
      togglePin(space, Boolean(this.mods["space-pin"]));
      closeOverlay(props()?.overlay);
      return;
    }
    if (item.command === "space.vscode") {
      closeOverlay(props()?.overlay);
      openVSCode(space);
      return;
    }
    if (item.command === "space.folder") {
      closeOverlay(props()?.overlay);
      openFolder(space);
      return;
    }
    closeOverlay(props()?.overlay);
    if (item.command === "worktree") {
      openOverlay({
        mod: this.mods["worktree-plus"] ? "worktree-plus" : "worktree",
        kind: "dialog",
        ...(item.args.action === "open" ? { width: 560, height: 480 } : { width: 440, height: 260 }),
        props: item.args,
      });
    } else {
      run(item.command, item.args);
    }
  }

  render(cx) {
    const t = theme();
    const space = this.space();
    if (!space) {
      return v_flex().w_full().p(12).bg(t.popover).text_color(t.muted).child("Space closed");
    }
    const list = this.list();
    const pinned = (shared("spaces.pinned") ?? []).includes(space.id);
    return v_flex().id("space-menu").track_focus(this.handle).w_full().min_h(0).p(5).bg(t.popover).text_size(12.8)
      .on_key_down((event, cx) => {
        if (event.key === "down") this.move(1);
        else if (event.key === "up") this.move(-1);
        else if (event.key === "enter") this.choose();
        else if (event.key === "escape") closeOverlay(props()?.overlay);
        else return;
        cx.notify();
      })
      .child(h_flex().px(8).pt(3).pb(5).gap(7).items_center().text_size(11).text_color(t.dim)
        .child(svg("mods/space-menu/pin.svg").size(12).flex_none().text_color(pinned ? t.accent : t.dim))
        .child(div().flex_1().truncate().child(space.name)))
      .children(list.map((item, i) => item.sep
        ? div().mx(7).my(4).h(1).bg(t.border)
        : h_flex().id(`smi-${i}`).h(31).px(8).gap(9).rounded(7).items_center().justify_between().text_color(t.foreground)
          .when(i === this.at, (el) => el.bg(t.selected))
          .hover((s) => s.bg(t.hover))
          .on_click(() => { this.at = i; this.choose(); })
          .child(svg(iconFor(item)).size(14).flex_none().text_color(t.muted))
          .child(div().flex_1().child(item.label))
          .child(div().text_size(11).text_color(t.dim).child(item.hint || shortcut(item.command, item.args)))));
  }
}
