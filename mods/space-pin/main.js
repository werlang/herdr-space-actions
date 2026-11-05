// The placeholder pane a pinned space keeps when every terminal/agent closes.
// It is a normal mod tab (`tab.new { mod: "space-pin" }`), so the space survives
// an empty tab set. Right-click the space to unpin it.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, spaces, panes, run, theme, shared, setShared, knownAgents, window, keys } from "herdr";

// The last agents each machine reported, shared with new-menu / new-menu-plus.
const KNOWN = "new-menu.agents";

function shortcut(name) {
  const k = keys().find((b) => b.section === "global" && (b.action === name || (name === "tab.new" && b.action === "spaces-plus.newTerminal")));
  if (!k?.keys.trim()) return "";
  const mac = window()?.platform === "macos";
  const names = mac ? { ctrl: "⌃", alt: "⌥", shift: "⇧", cmd: "⌘", fn: "fn" } : { ctrl: "Ctrl", alt: "Alt", shift: "Shift", cmd: "Super", fn: "Fn" };
  const alias = { secondary: mac ? "cmd" : "ctrl", super: "cmd", win: "cmd" };
  return k.keys.trim().split(/\s+/).map((stroke) => {
    const parts = stroke.split("-");
    let key = parts.pop();
    if (key === "") { key = "-"; parts.pop(); }
    const held = new Set(parts.map((m) => alias[m.toLowerCase()] ?? m.toLowerCase()));
    if (/^[A-Z]$/.test(key)) held.add("shift");
    const label = key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1).toLowerCase();
    return [...Object.keys(names).filter((m) => held.has(m)).map((m) => names[m]), label].join(mac ? "" : "+");
  }).join(" ");
}

function place(space) {
  const pinned = (shared("spaces.pinned") ?? []).includes(space.id);
  if (pinned) {
    const loc = (shared("spaces.pinned_locations") ?? {})[space.id];
    if (loc) return loc;
  }
  const tabs = new Set((space.tabs ?? []).map((tab) => tab.id));
  return panes().find((pane) => tabs.has(pane.tab) && pane.cwd)?.cwd || space.folder;
}

export default class SpacePin extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.timer.after(50, () => this.handle?.focus());
    cx.timer.after(200, () => this.handle?.focus());
    const space = spaces().find((s) => s.id === props()?.space) ?? spaces().find((s) => s.active);
    const where = space?.machine ?? "";
    this.agents = shared(KNOWN)?.[where] ?? [];
    cx.spawn(async (cx) => {
      try {
        this.agents = await knownAgents({ on: space?.machine });
        setShared(KNOWN, { ...shared(KNOWN), [where]: this.agents });
      } catch {
        this.failed = true;
      }
      cx.notify();
    });
  }

  row(id, icon, name, action, hint = "") {
    const t = theme();
    return h_flex().id(id).h(31).px(9).gap(10).rounded(7).items_center().flex_none()
      .text_color(t.foreground).cursor_pointer()
      .hover((s) => s.bg(t.selected))
      .on_click(action)
      .child(icon).child(div().flex_1().child(name)).child(div().text_size(11).text_color(t.dim).child(hint));
  }

  render() {
    const t = theme();
    const value = props() ?? {};
    const space = spaces().find((candidate) => candidate.id === value.space)
      ?? spaces().find((candidate) => candidate.active)
      ?? null;
    const folder = (space && place(space)) || value.folder;
    const where = space?.machine ?? "";
    const agents = (this.agents && this.agents.length) ? this.agents : (shared(KNOWN)?.[where] ?? []);
    const installed = agents.filter((a) => a.installed);
    const count = 1 + installed.length;
    const menuHeight = Math.min(280, 10 + count * 31);

    return v_flex().size_full().bg(t.surface).items_center().justify_center().p(24)
      .track_focus(this.handle)
      .on_key_down((e) => {
        if (e.modifiers.control || e.modifiers.platform || e.modifiers.alt) return;
        if (e.key === "Enter") {
          run("tab.new", { space: space?.id, ...(folder ? { folder } : {}) });
          return;
        }
        const agent = /^[1-9]$/.test(e.key) ? installed[Number(e.key) - 1] : null;
        if (!agent) return;
        run("tab.new", { name: agent.name, space: space?.id, ...(folder ? { folder } : {}), argv: agent.run });
      })
      .child(v_flex().items_center().gap(6).flex_none()
        .child(svg("mods/space-pin/pin.svg").size(30).flex_none().text_color(t.accent))
        .child(div().text_size(15).text_color(t.foreground).child("Pinned space"))
        .when(Boolean(space), (el) => el.child(div().text_size(12).text_color(t.muted).child(space.name)))
        .when(Boolean(folder), (el) => el.child(div().max_w(520).truncate().text_size(11).text_color(t.dim).child(folder))))
      .child(v_flex().id("space-pin-menu").mt(16).w(260).flex_none().h(menuHeight)
        .rounded(8).bg(t.popover).border_1().border_color(t.border).p(5).text_size(12.8)
        .when(count * 31 > 270, (el) => el.overflow_y_scrollbar())
        .child(this.row("terminal", svg("icons/shell.svg").size(14), "Terminal", () => run("tab.new", { space: space?.id, ...(folder ? { folder } : {}) }), shortcut("tab.new")))
        .children(installed.map((a, i) => this.row(a.key, a.tint ? svg(a.icon).size(14).text_color(t.foreground) : image(a.icon).size(14), a.name,
          () => run("tab.new", { name: a.name, space: space?.id, ...(folder ? { folder } : {}), argv: a.run }), i < 9 ? String(i + 1) : ""))));
  }
}
