// Workspace spaces: stable colored avatars, worktrees under their checkout,
// grouped by machine when more than one is known. Under a space's name, the repo
// its first terminal is in now (only where unusual) and the checked-out branch,
// with colored dots for a dirty worktree and ↑/↓ counts for commits still to
// push or pull. Agent state lives in the agents list, not here. Click to switch,
// right-click for its menu, sort from the header, drag to reorder in manual order.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, machines, panes, run, openOverlay, closeOverlay, props, exec, hc, theme, shared, setShared, watchFolder, window, layout, nextCommand } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// Where a space is now: pinned spaces keep their pinned location,
// while unpinned spaces follow their first terminal's live folder (else where made).
// `ps`: panes(), read once by the caller (each read copies every pane).
function place(s, ps) {
  const pinned = (shared("spaces.pinned") ?? []).includes(s.id);
  if (pinned) {
    const loc = (shared("spaces.pinned_locations") ?? {})[s.id];
    if (loc) return loc;
  }
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}

function hasPinTab(s, ps = panes()) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return ps.some((p) => p.mod === "space-pin" && tabs.has(p.tab));
}
// A repo row carries a second, smaller line (branch and state); the rest stay
// one line tall.
const rowHeight = ({ tree, g }) => (g ? 38 : tree ? 28 : 30);
const where = (s, ps) => JSON.stringify([s.machine ?? null, place(s, ps)]);
const base = (path) => path.replace(/\/+$/, "").split("/").pop();

// Where a new terminal tab should start: a pinned space's locked folder, else
// the focused terminal's cwd (Herdr's own default), else the space's folder.
// Bound to `spaces-plus.newTerminal` so cmd+t does not ignore a pin.
function newTerminalFolder(s, ps) {
  if (!s) return undefined;
  const pinned = (shared("spaces.pinned") ?? []).includes(s.id);
  if (pinned) {
    const loc = (shared("spaces.pinned_locations") ?? {})[s.id];
    if (loc) return loc;
  }
  return ps.find((p) => p.focused && !p.mod)?.cwd || s.folder || undefined;
}
// Changes made outside Herdr (an editor's save, a commit in another app): looked
// for this often, in repos the list shows, while the window is in front.
const FALLBACK = 60000;

// What a stored color name looks like on an avatar (the same in every mod
// that draws space avatars): one strong color per hue, light and dark alike.
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };

// How the list is ordered. Manual keeps Herdr's own space order (and dragging);
// every other mode sorts the rows without touching the model, so the order can
// follow status or git state as it changes and come back to manual untouched.
const SORTS = [
  { id: "manual", label: "Manual order", icon: "layers", tip: "Keep Herdr's order; drag rows to reorder" },
  { id: "name", label: "Alphabetical", icon: "file-text", tip: "A to Z by space name" },
  { id: "priority", label: "Priority", icon: "circle-check", tip: "Blocked, idle, done, then everything else" },
  { id: "dirty", label: "Uncommitted changes", icon: "square-pen", tip: "Most uncommitted files first" },
  { id: "unpushed", label: "Unpushed commits", icon: "git-branch", tip: "Most commits to push first" },
  { id: "activity", label: "Last activity", icon: "clock", tip: "Most recent state change first" },
];
const sortOf = () => SORTS.find((s) => s.id === shared("spaces.sort")) ?? SORTS[0];

// What needs you first: a blocked agent, then an idle one (ready for more work),
// then one that finished while you were away; working or quiet spaces follow.
const RANK = { blocked: 3, idle: 2, done: 1 };
const rankOf = (w) => RANK[w.status] ?? 0;
const changesOf = (g) => (g ? g.conflicts + g.staged + g.unstaged + g.untracked : 0);
const unpushedOf = (g) => g?.ahead ?? 0;
// A tab's changed_at is when something in it last changed state; the newest tab
// is the space's last activity. Tabs with nothing yet stay at 0.
const activeAt = (w) => Math.max(0, ...(w.tabs ?? []).map((tab) => tab.changed_at ?? 0));

// A space speaks up only when something in it needs you.
export function glyph(status) {
  return status === "blocked" || status === "done" ? "●" : "·";
}

export function tone(t, status) {
  return t[status] ?? t.unknown;
}

const isObject = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/**
 * Safely parse a JSON value from localStorage with a fallback and type guard.
 */
function readJSON(key, fallback, isValid) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const val = JSON.parse(raw);
    return isValid(val) ? val : fallback;
  } catch {
    return fallback;
  }
}

export default class Spaces extends View {
  init(_props, cx) {
    if (props()?.sortMenu) return;
    this.git = {}; // where() -> { name, branch, ahead, behind, repo, linked }, null: not a repo
    this.checked = {}; // where() -> when it was last looked at
    this.unsure = new Set(); // where()s git couldn't answer for (a machine away)
    this.pending = new Set(); // where()s to look at next
    this.busy = {}; // pane -> an agent working or a program in front of its shell
    this.ready = {}; // machine -> its layout was readable at the last look
    this.at = {}; // space -> its where() at the last look
    this.watching = new Map(); // local repos' git folders: repo -> loop token
    // Spaces made while this runs wait (at most a moment) for their git, so a
    // worktree appears under its repo instead of jumping there.
    this.shown = new Set(spaces().map((s) => s.id));
    this.born = {};
    this.pressed = null;
    this.over = null;
    this.machines = [];
    this.pendingPins = new Set();
    this.reconnecting = readJSON("machines.reconnecting", {}, isObject);
    for (const state of Object.values(this.reconnecting)) state.busy = false;
    this.folded = new Set(readJSON("machines.folded", [], Array.isArray));
    this.refreshMachines(cx);
    cx.timer.every(15000, cx => this.refreshMachines(cx));
    // `git status` walks the whole tree, on another machine a process there:
    // only when its answer could have changed (see `due`).
    cx.timer.every(250, (cx) => this.checkNew(cx));
    cx.timer.after(100, () => this.ensurePinTabs());
    // A mod command instead of Herdr's built-in tab.new, so a pinned space
    // starts its terminals where it is pinned, not where the space was made.
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command !== "newTerminal" && command !== "newTab") continue;
        const space = spaces().find((s) => s.active);
        if (!space) continue;
        const allPanes = panes();
        const holder = (space.tabs ?? []).find((t) => allPanes.some((p) => p.tab === t.id && p.mod === "space-pin"));
        if (holder) {
          run("tab.select", { id: holder.id });
          const pane = allPanes.find((p) => p.tab === holder.id);
          if (pane) {
            run("pane.focus", { pane: pane.pane });
            cx.timer.after(20, () => run("pane.focus", { pane: pane.pane }));
            cx.timer.after(80, () => run("pane.focus", { pane: pane.pane }));
          }
        } else {
          const loc = (shared("spaces.pinned_locations") ?? {})[space.id] || space.folder;
          run("tab.new", { space: space.id, mod: "space-pin", name: "New tab", props: { space: space.id, folder: loc } });
          cx.timer.after(40, () => {
            const ps = panes();
            const sp = spaces().find((s) => s.active);
            const h = (sp?.tabs ?? []).find((t) => ps.some((p) => p.tab === t.id && p.mod === "space-pin"));
            if (h) {
              const pane = ps.find((p) => p.tab === h.id);
              if (pane) run("pane.focus", { pane: pane.pane });
            }
          });
        }
        cx.notify();
      }
    });
  }

  checkNew(cx) {
    const now = Date.now();
    const sp = spaces();
    const ps = panes();
    this.ensurePinTabs(sp, ps);
    for (const s of sp) if (!this.shown.has(s.id)) this.born[s.id] ??= now;
    const due = this.due(now, sp, ps);
    if (due.size) this.refreshGit(due, cx);
    if (sp.some((s) => !this.shown.has(s.id))) cx.notify();
  }

  /**
   * Ensure every open pinned space retains its space-pin placeholder tab,
   * restoring it if closed, lost after an unclean restart, or never created.
   */
  ensurePinTabs(sp = spaces(), ps = panes()) {
    const pinnedIds = new Set(shared("spaces.pinned") ?? []);
    const pinnedLocs = shared("spaces.pinned_locations") ?? {};
    const openIds = new Set(sp.map((s) => s.id));
    for (const id of this.pendingPins) if (!openIds.has(id)) this.pendingPins.delete(id);
    const activeSpace = sp.find((candidate) => candidate.active)?.id;
    const activeTab = (sp.find((candidate) => candidate.id === activeSpace)?.tabs ?? []).find((tab) => tab.active)?.id;
    for (const p of sp) {
      if (!pinnedIds.has(p.id)) {
        this.pendingPins.delete(p.id);
        continue;
      }
      const tabs = p.tabs ?? [];
      const hasRegular = tabs.some((t) => !ps.some((pane) => pane.tab === t.id && pane.mod === "space-pin"));
      if (hasRegular || hasPinTab(p, ps)) {
        this.pendingPins.delete(p.id);
        continue;
      }
      if (this.pendingPins.has(p.id)) continue;
      this.pendingPins.add(p.id);
      const loc = pinnedLocs[p.id] || place(p, ps);
      run("tab.new", { space: p.id, mod: "space-pin", name: "New tab", props: { space: p.id, folder: loc } });
      if (activeSpace) run("space.select", { id: activeSpace });
      if (activeTab) run("tab.select", { id: activeTab });
    }
  }

  // Places whose git could have changed: new ones (a new space, a cd), where a
  // command or an agent's turn just ended (a checkout, a commit, edits), those on
  // a machine that is back, and repos in view whose fallback is due.
  due(now, sp, ps) {
    // Moved there: what it knew of that place may be old.
    const at = {};
    for (const s of sp) at[s.id] = where(s, ps);
    const keys = new Set(Object.values(at).filter((k) => JSON.parse(k)[1]));
    const due = new Set([...keys].filter((k) => !(k in this.git)));
    for (const [id, k] of Object.entries(at)) if (this.at[id] && this.at[id] !== k && keys.has(k)) due.add(k);
    this.at = at;
    const spaceOf = {};
    for (const s of sp) for (const t of s.tabs ?? []) spaceOf[t.id] = s;
    const busy = {};
    for (const p of ps) {
      if (!p.terminal || !spaceOf[p.tab]) continue;
      busy[p.pane] = p.status === "working" || !(p.program?.shell || p.program?.agent);
      if (this.busy[p.pane] && !busy[p.pane]) this.sameRepo(at[spaceOf[p.tab].id], keys).forEach((k) => due.add(k));
    }
    this.busy = busy;
    for (const m of machines()) {
      const ready = m.layout === "ready";
      if (ready && this.ready[m.name] === false) for (const k of keys) if (JSON.parse(k)[0] === m.name) due.add(k);
      this.ready[m.name] = ready;
    }
    if (window().active) {
      for (const k of keys) {
        const asks = this.git[k] || this.unsure.has(k);
        if (asks && !this.folded.has(JSON.parse(k)[0]) && now - (this.checked[k] ?? 0) > FALLBACK) due.add(k);
      }
    }
    return due;
  }

  // `key` and the other places in its repo (a commit there moves their ahead/behind).
  sameRepo(key, keys) {
    const repo = this.git[key]?.repo;
    return [key, ...(repo ? [...keys].filter((k) => this.git[k]?.repo === repo) : [])];
  }

  refreshMachines(cx) {
    cx.spawn(async cx => {
      try { const r = await hc(["machine", "ls", "--json"]); if (r.code === 0) this.machines = (JSON.parse(r.stdout).machines ?? []).filter((m) => !m.temporary); } catch {}
      cx.notify();
    });
  }

  rebuilt(machine) {
    return machine?.state === "unreachable" && /^a different core answers there \("[^"]+"\)$/.test(machine.why ?? "");
  }

  reconnect(machine, cx) {
    const name = machine.name;
    if (this.reconnecting[name]?.busy) return;
    const state = this.reconnecting[name] ??= { machine, removed: false };
    state.busy = true;
    state.error = null;
    localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
    cx.notify();
    cx.spawn(async cx => {
      try {
        const ask = async args => {
          const r = await hc([...args, "--json"]);
          if (r.code !== 0) {
            let error;
            try { error = JSON.parse(r.stdout || r.stderr).error?.message; } catch {}
            throw new Error(error || r.stderr || r.stdout || "Couldn't connect.");
          }
        };
        if (!state.removed) {
          await ask(["machine", "rm", name]);
          state.removed = true;
          localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
        }
        const args = ["machine", "add"];
        if (machine.via) args.push("--via", machine.target);
        else args.push(machine.target);
        args.push("--name", name);
        if (machine.session) args.push("--session", machine.session);
        if (machine.temporary) args.push("--temp");
        await ask(args);
        this.folded.delete(name);
        localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
        delete this.reconnecting[name];
      } catch (e) {
        state.error = String(e.message ?? e);
        state.busy = false;
      }
      localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
      this.refreshMachines(cx);
      cx.notify();
    });
  }

  // One look at a time, each place once however often it was asked for meanwhile.
  refreshGit(keys, cx) {
    for (const k of keys) this.pending.add(k);
    if (this.refreshing) return;
    this.refreshing = true;
    cx.spawn(async (cx) => {
      while (this.pending.size) {
        const keys = [...this.pending];
        this.pending.clear();
        for (const key of keys) await this.check(key, cx);
      }
      const used = new Set(Object.values(this.git).filter(Boolean).map((g) => JSON.parse(g.repo)).filter(([on]) => !on).map(([, repo]) => repo));
      for (const repo of this.watching.keys()) if (!used.has(repo)) this.watching.delete(repo);
      this.refreshing = false;
      cx.notify();
    });
  }

  /**
   * One place's git: branch, ahead/behind, its repo.
   * If rev-parse fails, marks the key unsure, preserves previous git info, and returns.
   */
  async check(key, cx) {
    const [on, cwd] = JSON.parse(key);
    this.checked[key] = Date.now();
    this.unsure.delete(key);
    try {
      // No optional locks: a status that touched the index would wake the watch again.
      // Writes nothing under .git (index lock, fsmonitor cookie): watch() would wake on it.
      const r = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v2", "--branch"], { cwd, on });
      if (r.code !== 0) {
        // Only git's own "no" is remembered as no repo; anything else is asked again.
        if (!/not a git repository/i.test(r.stderr)) this.unsure.add(key);
        this.git[key] = null;
        return;
      }
      // The repo's own .git folder names it; a worktree's top differs from it.
      const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
      const common = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, on });
      if (top.code !== 0 || common.code !== 0) {
        this.unsure.add(key);
        this.git[key] ??= null;
        return;
      }
      const repo = common.stdout.trim();
      const name = repo.endsWith("/.git") ? base(repo.slice(0, -5)) : base(repo).replace(/\.git$/, "");
      const info = {
        name, branch: null, ahead: 0, behind: 0,
        conflicts: 0, staged: 0, unstaged: 0, untracked: 0,
        repo: JSON.stringify([on, repo]), linked: repo !== `${top.stdout.trim()}/.git`,
      };
      for (const line of r.stdout.split("\n")) {
        if (line.startsWith("# branch.head ")) info.branch = line.slice(14);
        else if (line.startsWith("# branch.ab ")) {
          const [a, b] = line.slice(12).split(" ");
          info.ahead = Math.abs(parseInt(a, 10)) || 0;
          info.behind = Math.abs(parseInt(b, 10)) || 0;
        }
        // Porcelain v2: one line per change, its two status letters in columns 3-4.
        else if (line.startsWith("? ")) info.untracked += 1;
        else if (line.startsWith("u ")) info.conflicts += 1;
        else if (line.startsWith("1 ") || line.startsWith("2 ")) {
          if (line[2] !== ".") info.staged += 1;
          if (line[3] !== ".") info.unstaged += 1;
        }
      }
      this.git[key] = info;
      if (!on) this.watch(repo, cx);
    } catch {
      // Couldn't ask (the machine is away): keep what it showed, look again later.
      this.git[key] ??= null;
      this.unsure.add(key);
    }
  }

  /**
   * Watch a local git repo folder for changes.
   * Tracks active loops via Map<repo, token> so stale loops terminate when a repo is revisited.
   */
  watch(repo, cx) {
    if (this.watching.has(repo)) return;
    const token = {};
    this.watching.set(repo, token);
    cx.spawn(async (cx) => {
      try {
        while (this.watching.get(repo) === token) {
          await watchFolder(repo);
          const mine = JSON.stringify([null, repo]);
          if (this.watching.get(repo) === token) this.refreshGit(Object.keys(this.git).filter((k) => this.git[k]?.repo === mine), cx);
        }
      } catch {
        if (this.watching.get(repo) === token) this.watching.delete(repo);
      }
    });
  }

  menu(w) {
    // A popup is as tall as its items; height is only the most.
    openOverlay({ mod: "space-menu", kind: "popup", width: 240, height: 320, props: { space: w.id } });
  }

  sortMenu(t) {
    const on = sortOf().id;
    return v_flex()
      .w_full()
      .p(5)
      .bg(t.popover)
      .text_size(12.8)
      .child(div().px(8).pt(4).pb(6).text_size(11).text_color(t.dim).child("Sort spaces"))
      .children(SORTS.map((s) => h_flex()
        .id(`space-sort-${s.id}`)
        .h(31)
        .px(8)
        .gap(9)
        .rounded(7)
        .items_center()
        .text_color(t.foreground)
        .hover((el) => el.bg(t.hover))
        .tooltip(s.tip)
        .on_click(() => {
          setShared("spaces.sort", s.id);
          closeOverlay(props().overlay);
        })
        .child(svg(`mods/workspace-chrome/${s.icon}.svg`).size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().child(s.label))
        .when(s.id === on, (el) => el.child(svg("mods/workspace-chrome/check.svg").size(14).flex_none().text_color(t.foreground)))));
  }

  // Spaces in order, each worktree space moved under its main checkout's. With
  // a sort other than manual, the top-level rows and each repo's worktrees are
  // ordered by that key; the repo row borrows its worktrees' numbers so a dirty
  // or blocked worktree lifts the whole repo into view.
  ordered() {
    const sp = spaces(), ps = panes();
    const ready = (w) => this.shown.has(w.id) || where(w, ps) in this.git || Date.now() - (this.born[w.id] ??= Date.now()) > 1500;
    for (const w of sp) if (!this.shown.has(w.id) && ready(w)) this.shown.add(w.id);
    const list = sp.map((w, i) => ({ w, i, g: this.git[where(w, ps)] ?? null })).filter((r) => this.shown.has(r.w.id));
    const mains = new Set(list.filter((r) => r.g && !r.g.linked).map((r) => r.g.repo));
    const nested = (r) => r.g?.linked && mains.has(r.g.repo);
    const sort = sortOf();
    const kidsOf = (r) => (r.g && !r.g.linked ? list.filter((k) => nested(k) && k.g.repo === r.g.repo) : []);
    const key = new Map();
    for (const r of list) {
      const kids = kidsOf(r);
      if (sort.id === "priority") key.set(r, Math.max(rankOf(r.w), ...kids.map((k) => rankOf(k.w))));
      else if (sort.id === "dirty") key.set(r, changesOf(r.g) + kids.reduce((n, k) => n + changesOf(k.g), 0));
      else if (sort.id === "unpushed") key.set(r, unpushedOf(r.g) + kids.reduce((n, k) => n + unpushedOf(k.g), 0));
      else if (sort.id === "activity") key.set(r, Math.max(activeAt(r.w), ...kids.map((k) => activeAt(k.w))));
      else if (sort.id === "name") key.set(r, r.w.name.toLocaleLowerCase());
      else key.set(r, r.i);
    }
    const cmp = (x, y) => {
      if (sort.id === "manual") return x.i - y.i;
      const a = key.get(x), b = key.get(y);
      if (sort.id === "name") return String(a).localeCompare(String(b)) || x.i - y.i;
      return b - a || x.i - y.i;
    };
    const top = list.filter((r) => !nested(r));
    if (sort.id !== "manual") top.sort(cmp);
    const out = [];
    const placed = new Set(); // repos whose worktrees are listed (under the first of its spaces)
    for (const r of top) {
      out.push({ ...r, tree: null });
      if (!r.g || r.g.linked || placed.has(r.g.repo)) continue;
      placed.add(r.g.repo);
      const kids = [...kidsOf(r)];
      if (sort.id !== "manual") kids.sort(cmp);
      kids.forEach((k, n) => out.push({ ...k, tree: n === kids.length - 1 ? "└─" : "├─" }));
    }
    return out;
  }

  // The rows, under a header per machine once one isn't this computer.
  grouped(t, collapsed) {
    const rows = this.ordered();
    const draw = (r) => (collapsed ? this.compact(r, t) : this.row(r, t));
    const remote = [...new Set([...rows.map(r => r.w.machine).filter(Boolean), ...this.machines.map(m => m.name), ...Object.keys(this.reconnecting)])].sort();
    const loading = m => {
      const layout = machines().find(k => k.name === m)?.layout;
      return layout === "loading" || (!layout && this.machines.some(k => k.name === m && k.state === "connected"))
        || spaces().some(s => (s.machine ?? null) === m && !this.shown.has(s.id));
    };
    const loadingRow = m => div().id(`machine-loading-${m ?? "local"}`).h(28).flex_none().px(8).text_size(12).text_color(t.dim).child(collapsed ? "…" : "Loading…");
    if (!remote.length) return loading(null) && !rows.length ? [loadingRow(null)] : rows.map(draw);
    const machineNames = [null, ...remote];
    return machineNames.flatMap((m) => {
      const mine = rows.filter((r) => (r.w.machine ?? null) === m);
      const repair = this.reconnecting[m];
      const machine = this.machines.find(k => k.name === m) ?? repair?.machine;
      const connected = !m || machine?.state === "connected";
      const rebuilt = this.rebuilt(machine) || !!repair;
      const folded = this.folded.has(m);
      const head = h_flex().id(`machine-${m ?? "local"}`).h(26).flex_none().px(collapsed ? 2 : 8).gap(7).items_center().text_size(11).text_color(t.dim)
        .cursor_pointer().hover(s => s.bg(t.hover))
        .on_click((_e, cx) => {
          folded ? this.folded.delete(m) : this.folded.add(m);
          localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/${m ? "server" : "monitor"}.svg`).size(13).flex_none())
        .when(!collapsed, el => el.child(div().flex_1().truncate().child(m ?? "This computer"))
          .when(!connected && !rebuilt, el => el.child(div().flex_none().child((machine?.state ?? "asleep").replace(/_/g, " "))))
          .when(rebuilt, el => el.child(h_flex().flex_none().gap(3).items_center()
            .child(div().max_w(140).truncate().child(repair?.error || "rebuilt ·"))
            .child(div().id(`machine-connect-${m}`).text_color(repair?.error ? t.blocked : t.muted)
              .hover(s => s.text_color(t.foreground))
              .tooltip(repair?.error || "This machine was rebuilt or replaced. Click to connect to the new one.")
              .on_click((_e, cx) => { cx.stop_propagation(); this.reconnect(machine, cx); })
              .child(repair?.busy ? "Connecting…" : "Connect"))))
          .when(connected, el => el.child(div().id(`machine-add-${m ?? "local"}`).flex_none().px(4).rounded(4).hover(s => s.bg(t.hover).text_color(t.foreground))
            .on_click((_e, cx) => { cx.stop_propagation(); run("space.new", { machine: m ?? "" }); }).child("+")))
          .child(div().size(6).rounded(3).flex_none().bg(connected ? t.ansi2 : t.dim))
          .child(svg(`mods/workspace-chrome/chevron-${folded ? "right" : "down"}.svg`).size(11).flex_none()));
      const empty = h_flex().id(`machine-new-${m ?? "local"}`).h(28).flex_none().px(8).gap(7).items_center().rounded(7)
        .text_size(12).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
        .on_click(() => run("space.new", { machine: m ?? "" }))
        .child(svg("mods/workspace-chrome/plus.svg").size(12)).when(!collapsed, el => el.child("New space there"));
      if (!collapsed && rebuilt) return [head];
      return [head, ...(folded ? [] : mine.length ? mine.map(draw) : [loading(m) ? loadingRow(m) : empty])];
    });
  }

  // The small line under the name: the repo when the name doesn't already say
  // it, then the checked-out branch. Unlike before, main/master stay visible:
  // the branch is the one git fact a space row should always tell.
  gitText(g, tree, name) {
    const same = (a) => a.toLowerCase() === name.toLowerCase();
    const repo = tree || same(g.name) ? "" : g.name;
    const branch = g.branch ?? "detached";
    return [repo, branch].filter(Boolean).join(" \u00b7 ");
  }

  // What the worktree holds, right of the branch: a colored dot per kind of
  // change and ↑n/↓n for commits still to push or pull. The dots keep their
  // counts in a tooltip, so the row stays quiet when everything is clean.
  gitMarks(g, t) {
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const dot = (n, color, tip) => div().flex_none().size(8).rounded(4).bg(color).tooltip(tip);
    return h_flex()
      .flex_none()
      .gap(4)
      .items_center()
      .text_size(10.5)
      .when(g.conflicts > 0, (el) => el.child(dot(g.conflicts, t.ansi1, plural(g.conflicts, "conflict", "conflicts"))))
      .when(g.staged > 0, (el) => el.child(dot(g.staged, t.ansi2, plural(g.staged, "staged change", "staged changes"))))
      .when(g.unstaged > 0, (el) => el.child(dot(g.unstaged, t.ansi3, plural(g.unstaged, "modified file", "modified files"))))
      .when(g.untracked > 0, (el) => el.child(dot(g.untracked, t.ansi4, plural(g.untracked, "untracked file", "untracked files"))))
      .when(g.ahead > 0, (el) => el.child(div().flex_none().text_color(t.ansi2).tooltip(plural(g.ahead, "commit to push", "commits to push")).child(`\u2191${g.ahead}`)))
      .when(g.behind > 0, (el) => el.child(div().flex_none().text_color(t.ansi1).tooltip(plural(g.behind, "commit to pull", "commits to pull")).child(`\u2193${g.behind}`)));
  }

  gitLine(g, tree, name, t) {
    const text = this.gitText(g, tree, name);
    return h_flex()
      .h(13)
      .flex_none()
      .min_w(0)
      .gap(6)
      .items_center()
      .pl(tree ? 44 : 27)
      .child(div().flex_1().min_w(0).truncate().text_size(10.5).text_color(t.dim).tooltip(text).child(text))
      .child(this.gitMarks(g, t));
  }

  row({ w, i, g, tree }, t) {
    const on = w.active;
    const pinned = (shared("spaces.pinned") ?? []).includes(w.id);
    const colors = shared("space.colors") ?? {};
    const color = colors[w.id] ?? "ansi6";
    const fill = color.startsWith("#") ? color : (MARK[color] ?? t[color]);
    return v_flex()
      .relative()
      .id(`space-${w.id}`)
      .px(8)
      .h(rowHeight({ tree, g }))
      .flex_none()
      .justify_center()
      .rounded(8)
      .when(on, (el) => el.bg(t.selected))
      .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
      .when(this.pressed === i && this.over !== i, (el) => el.opacity(0.5))
      .when(this.pressed !== null && this.over === i && this.pressed !== i, (el) => el.child(
        div().absolute().left(0).right(0).h(2).bg(t.accent)
          .when(this.pressed < i, line => line.bottom(0))
          .when(this.pressed > i, line => line.top(0)),
      ))
      .when(this.sortId === "manual", (el) => el
        .on_mouse_down("left", () => {
          this.pressed = i;
          this.over = i;
        })
        .on_mouse_move((_e, cx) => {
          const source = spaces()[this.pressed];
          const over = source && (source.machine ?? null) === (w.machine ?? null) ? i : null;
          if (this.pressed !== null && this.over !== over) {
            this.over = over;
            cx.notify();
          }
        })
        .on_mouse_up("left", (_e, cx) => {
          const from = this.pressed;
          const over = this.over;
          this.pressed = null;
          this.over = null;
          if (from !== null && over === i && from !== i) run("space.move", { id: spaces()[from].id, index: i + 1 });
          else if (from === i) run("space.select", { id: w.id });
          cx.notify();
        }))
      .when(this.sortId !== "manual", (el) => el.on_click(() => run("space.select", { id: w.id })))
      .on_mouse_down("right", () => this.menu(w))
      .child(
        v_flex()
          .min_w(0)
          .child(
            h_flex()
              .gap(9)
              .items_center()
              .when(Boolean(tree), el => el.pl(22).child(svg("mods/workspace-chrome/branch.svg").size(13).text_color(t.dim)))
              .when(!tree, el => el.child(h_flex().size(18).flex_none().rounded(5).bg(fill).items_center().justify_center().text_size(10.5).font_bold().text_color("#ffffff").child([...w.name][0]?.toUpperCase() ?? "?")))
              .child(div().flex_shrink(0).max_w(150).truncate().text_color(t.foreground).child(w.name))
              .when(pinned, el => el.child(svg("mods/spaces-plus/pin.svg").size(11).flex_none().text_color(t.accent)))
              .when(!g, el => el.child(div().flex_1())),
          )
          .when(Boolean(g), el => el.child(this.gitLine(g, tree, w.name, t))),
      );
  }

  compact({ w, i }, t) {
    const pinned = (shared("spaces.pinned") ?? []).includes(w.id);
    return h_flex()
      .id(`space-${w.id}`)
      .h(26)
      .flex_none()
      .justify_center()
      .gap(4)
      .when(w.active, (el) => el.bg(t.raised))
      .hover((s) => s.bg(t.hover))
      .on_click(() => run("space.select", { id: w.id }))
      .child(div().text_color(w.active ? t.foreground : t.muted).child(String(i + 1)))
      .when(pinned, el => el.child(svg("mods/spaces-plus/pin.svg").size(10).flex_none().text_color(t.accent)))
      .child(div().text_color(tone(t, w.status)).child(glyph(w.status)));
  }

  render() {
    const t = theme();
    if (props()?.sortMenu) return this.sortMenu(t);
    const collapsed = narrow();
    const sort = sortOf();
    this.sortId = sort.id;
    if (sort.id !== "manual") {
      this.pressed = null;
      this.over = null;
    }
    const palette = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
    const sp = spaces();
    const colors = { ...(shared("space.colors") ?? {}) };
    let changed = false;
    for (const p of sp) {
      if (colors[p.id] || p.name === "~") continue;
      const uses = c => sp.filter(s => colors[s.id] === c).length;
      colors[p.id] = palette.reduce((best, c) => uses(c) < uses(best) ? c : best);
      changed = true;
    }
    if (changed) setShared("space.colors", colors);
    const pinnedIds = new Set(shared("spaces.pinned") ?? []);
    const pinnedLocs = { ...(shared("spaces.pinned_locations") ?? {}) };
    let locsChanged = false;
    const ps = panes();
    for (const p of sp) {
      if (pinnedIds.has(p.id) && !pinnedLocs[p.id]) {
        const tabs = new Set((p.tabs ?? []).map((c) => c.id));
        const current = ps.find((pane) => tabs.has(pane.tab) && pane.cwd)?.cwd || p.folder;
        if (current) {
          pinnedLocs[p.id] = current;
          locsChanged = true;
        }
      }
    }
    for (const id of Object.keys(pinnedLocs)) {
      if (!pinnedIds.has(id)) {
        delete pinnedLocs[id];
        locsChanged = true;
      }
    }
    if (locsChanged) setShared("spaces.pinned_locations", pinnedLocs);
    return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13)
      .child(h_flex().h(31).pl(16).pr(10).items_center().justify_between().text_size(11.5).text_color(t.dim)
        .when(!collapsed, el => el.child("Spaces"))
        .child(h_flex().flex_none().gap(2).items_center()
          .when(!collapsed, el => el.child(div().id("space-sort").size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
            .on_click(() => openOverlay({ mod: "spaces-plus", kind: "popup", width: 240, height: 226, props: { sortMenu: true } }))
            .tooltip(`Sort spaces: ${sort.label}`)
            .child(svg(`mods/workspace-chrome/${sort.icon}.svg`).size(14))))
          .child(div().id("space-new").size(26).flex_none().flex().items_center().justify_center().rounded(6).hover(s => s.bg(t.hover).text_color(t.foreground))
            .on_click(() => run("space.new")).child(svg("mods/workspace-chrome/plus.svg").size(14)))))
      .child(v_flex().flex_1().min_h(0).px(8).pb(14).overflow_y_scrollbar().mode("always")
        .on_mouse_up("left", (_e, cx) => { this.pressed = null; cx.notify(); })
        .children(this.grouped(t, collapsed)));
  }
}
