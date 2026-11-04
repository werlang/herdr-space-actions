import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, terminals, run, openOverlay, theme, window, shared, setShared, layout, settings, focused, nextCommand } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// One Copy reference row per live terminal, then Rename / New tab / Close,
// plus the rules between them (the popup is fixed-size, not content-sized).
function refCount(tabId) {
  const live = terminals().filter((t) => t.state === "live");
  const seen = new Set();
  for (const t of live) if (t.labels?.["herdr.tab"] === tabId) seen.add(t.address);
  for (const p of panes()) {
    if (p.tab !== tabId || !p.terminal) continue;
    const t = live.find((x) => x.address === p.terminal || String(p.terminal).endsWith(`/${x.address}`));
    if (t) seen.add(t.address);
  }
  return seen.size;
}

function menuHeight(tabId) {
  const refs = refCount(tabId);
  // Rename, New tab, Close, plus Pin/Unpin for a regular tab.
  const actions = panes().some((p) => p.tab === tabId && p.mod === "space-pin") ? 3 : 4;
  return 10 + (refs + actions) * 31 + 9 + (refs ? 9 : 0);
}

export default class Tabs extends View {
  init(_props, cx) {
    this.pressed = null;
    this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}");
    this.pendingZoomChat = false;
    // cmd-w is bound to tabs-ref.closeTab: a pinned tab is not closed, the
    // closest other tab is shown instead. `reorder` comes from the tab menu
    // after it toggles shared("tabs.pinned").
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "closeTab") this.closeActive();
        else if (command === "pin") this.togglePin();
        else if (command === "reorder") this.reorder();
        cx.notify();
      }
    });
    // Tabs are created, closed and dragged outside this mod's own clicks;
    // enforce "pinned first" cheaply (a no-op when the order is already right).
    cx.timer.every(1000, () => { if (this.pressed === null) this.reorder(); });
    cx.timer.after(100, () => this.reorder());
  }

  // Pinned tab ids as stored. A closed tab's id is kept: tab ids are unique and
  // never reused, so a stale id is harmless, while pruning it against a partial
  // spaces() during app startup (or an unreachable machine) would erase real
  // pins. Only unpinning removes an id.
  pinnedSet() {
    return new Set(shared("tabs.pinned") ?? []);
  }

  isPlaceholder(tabId, allPanes = panes()) {
    return allPanes.some((p) => p.tab === tabId && p.mod === "space-pin");
  }

  // Pinned regular tabs first, then unpinned regular tabs, then the pinned-
  // space placeholder (hidden whenever regular tabs exist). Only moved tabs
  // are touched, so dragging inside the pinned or unpinned block keeps order.
  reorder() {
    const space = spaces().find((s) => s.active);
    const tabs = space?.tabs ?? [];
    if (!tabs.length) return;
    const allPanes = panes(), pinned = this.pinnedSet();
    const isHolder = (t) => this.isPlaceholder(t.id, allPanes);
    const holders = tabs.filter(isHolder);
    const regular = tabs.filter((t) => !isHolder(t));
    const desired = [
      ...regular.filter((t) => pinned.has(t.id)),
      ...regular.filter((t) => !pinned.has(t.id)),
      ...holders,
    ];
    if (desired.every((t, i) => tabs[i]?.id === t.id)) return;
    // Move each tab to its final 1-based position; already-settled positions
    // stay put, so repeated runs converge instead of shuffling.
    desired.forEach((tab, i) => { if (tabs[i]?.id !== tab.id) run("tab.move", { id: tab.id, index: i + 1 }); });
  }

  // Toggle the active tab's pin state (also usable from a key or `herdr-app do`).
  // The right-click menu toggles the tab it was opened on instead.
  togglePin() {
    const space = spaces().find((s) => s.active);
    const tab = (space?.tabs ?? []).find((t) => t.active);
    if (!tab || this.isPlaceholder(tab.id)) return;
    const pinned = this.pinnedSet();
    if (pinned.has(tab.id)) pinned.delete(tab.id); else pinned.add(tab.id);
    setShared("tabs.pinned", [...pinned]);
    this.reorder();
  }

  // cmd-w on a pinned tab: show the closest other tab instead of closing it.
  // The pinned-space placeholder is only a last resort.
  closeActive() {
    const space = spaces().find((s) => s.active);
    const tab = (space?.tabs ?? []).find((t) => t.active);
    if (!tab) return;
    if (!this.pinnedSet().has(tab.id)) { run("tab.close", { id: tab.id }); return; }
    const tabs = space.tabs ?? [];
    const index = tabs.findIndex((t) => t.id === tab.id);
    const allPanes = panes();
    let others = tabs.filter((t) => t.id !== tab.id && !this.isPlaceholder(t.id, allPanes));
    if (!others.length) others = tabs.filter((t) => t.id !== tab.id);
    if (!others.length) return;
    // Nearest by position; a tie goes to the tab on the right.
    const nearest = others
      .map((t) => ({ tab: t, at: tabs.indexOf(t), distance: Math.abs(tabs.indexOf(t) - index) }))
      .sort((a, b) => a.distance - b.distance || b.at - a.at)[0].tab;
    run("tab.select", { id: nearest.id });
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  render() {
    const t = theme();
    const space = spaces().find(p => p.active);
    const tabs = space?.tabs ?? [];
    const allPanes = panes();
    const pinned = this.pinnedSet();
    // A pinned space's placeholder tab exists only to keep the space alive.
    // Hide it while the space has other tabs; show it only when it is the last one.
    const isHolder = (tab) => allPanes.some((pane) => pane.tab === tab.id && pane.mod === "space-pin");
    const shown = tabs.filter((tab) => {
      if (tabs.length <= 1) return true;
      return !isHolder(tab);
    });
    // The model order is kept pinned-first by `reorder`; sorting here too means
    // the very first frame after a switch already reads correctly.
    const ordered = [
      ...shown.filter((tab) => pinned.has(tab.id) && !isHolder(tab)),
      ...shown.filter((tab) => !pinned.has(tab.id) || isHolder(tab)),
    ];
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    const item = (c, i) => {
      const program = allPanes.find(p => p.tab === c.id && p.program?.agent)?.program ?? allPanes.find(p => p.tab === c.id)?.program;
      const name = /^tb\d+$/.test(c.name) ? program?.name ?? "Terminal" : c.name;
      const isChatZoomed = c.zoomed && allPanes.some(p => p.tab === c.id && p.mod === "agent-chat" && p.zoomed);
      const tabTitle = c.zoomed && !isChatZoomed ? `${name} Z` : name;
      return h_flex().id(`tab-${c.id}`).h(29).px(10).gap(7).rounded(7).items_center().flex_none().text_size(12.8)
        .border(1).border_color(c.active ? t.border : t.chrome).bg(c.active ? t.raised : t.chrome).text_color(c.active ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", (_e, cx) => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) {
            run("tab.move", { id: ordered[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
            // Let the move land, then put pinned tabs back in front if the drop
            // crossed the block boundary.
            cx.timer.after(60, (cx) => { this.reorder(); cx.notify(); });
          } else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "ref-menu", kind: "popup", width: 250, height: menuHeight(c.id), props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .when(Boolean(program?.icon), el => el.child(program.tint ? svg(program.icon).size(14).text_color(t.muted) : image(program.icon).size(14)))
        .child(div().max_w(170).truncate().child(tabTitle))
        .when(pinned.has(c.id) && !isHolder(c), el => el.child(svg("mods/ref-menu/pin.svg").size(11).flex_none().text_color(t.accent)))
        .when(c.status === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
        .when(c.status === "blocked" || c.status === "done", el => el.child(div().size(6).rounded(3).bg(t[c.status])))
        .when(c.active, el => el.child(div().id(`close-${c.id}`).text_color(t.dim).on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); }).child(svg("mods/pane/close.svg").size(12))));
    };
    const root = layout(), sidebar = find(root, "sidebar"), w = window();
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 10;
    const panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = shared("workspace.panels") ?? ["files", "changes"];
    this.syncPanel(space, panel, body, enabled);
    const panelButton = (id, label, icon) => {
      const on = panel && !panel.hidden && body?.active === id;
      return h_flex().id(`panel-${id}`).h(26).px(8).gap(5).flex_none().items_center().rounded(6)
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover)).on_mouse_down("left", stop)
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
        }).child(svg(icon).size(14)).child(label);
    };

    const chatToggle = () => {
      const activeTabId = space?.tabs?.find((x) => x.active)?.id;
      const tabPanes = panes().filter((p) => p.tab === activeTabId);
      const chatPane = tabPanes.find((p) => p.mod === "agent-chat");
      const terminalPane = tabPanes.find((p) => p.terminal);
      const isChat = Boolean(chatPane && (chatPane.zoomed || !terminalPane));

      // Auto-zoom chatPane right after initial creation once Herdr registers it
      if (this.pendingZoomChat && chatPane) {
        this.pendingZoomChat = false;
        if (!chatPane.zoomed) {
          run("pane.zoom", { pane: chatPane.pane });
        }
      }

      const showChat = () => {
        if (!chatPane) {
          this.pendingZoomChat = true;
          const activeTerminal = terminalPane?.terminal || focused()?.terminal || null;
          run("pane.split", {
            direction: "right",
            mod: "agent-chat",
            props: activeTerminal ? { terminal: activeTerminal } : undefined,
          });
        } else if (!chatPane.zoomed) {
          run("pane.zoom", { pane: chatPane.pane });
        }
      };

      const showOriginal = () => {
        if (terminalPane) {
          if (!terminalPane.zoomed) {
            run("pane.zoom", { pane: terminalPane.pane });
          }
        } else {
          run("terminal.open", { place: "right" });
        }
      };

      return h_flex()
        .id("view-mode-toggle-bar")
        .h(26)
        .p(2)
        .gap(2)
        .flex_none()
        .items_center()
        .rounded(6)
        .bg(t.raised || t.chrome)
        .border_1()
        .border_color(t.border)
        .on_mouse_down("left", stop)
        .child(
          h_flex()
            .id("toggle-original-view")
            .h(20)
            .px(6)
            .gap(4)
            .items_center()
            .rounded(4)
            .when(!isChat, (el) => el.bg(t.selected || t.raised).border_1().border_color(t.border))
            .cursor_pointer()
            .hover((s) => (!isChat ? s : s.bg(t.hover)))
            .on_click(showOriginal)
            .child(svg("mods/agent-chat/icons/terminal.svg").size(12).text_color(!isChat ? t.accent : t.muted))
            .child(
              div()
                .text_size(11)
                .font_medium()
                .text_color(!isChat ? t.foreground : t.muted)
                .child("Original")
            )
        )
        .child(
          h_flex()
            .id("toggle-chat-view")
            .h(20)
            .px(6)
            .gap(4)
            .items_center()
            .rounded(4)
            .when(isChat, (el) => el.bg(t.selected || t.raised).border_1().border_color(t.border))
            .cursor_pointer()
            .hover((s) => (isChat ? s : s.bg(t.hover)))
            .on_click(() => {
              if (isChat) showOriginal();
              else showChat();
            })
            .child(svg("mods/agent-chat/icons/chat.svg").size(12).text_color(isChat ? t.accent : t.muted))
            .child(
              div()
                .text_size(11)
                .font_medium()
                .text_color(isChat ? t.foreground : t.muted)
                .child("Chat")
            )
        );
    };

    return h_flex().size_full().min_w(0).px(10).pl(lightsPadding).gap(3).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => { if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(3).overflow_x_scrollbar().children(ordered.map(item)))
      .child(button("tab-new", "+", () => openOverlay({ mod: "new-menu-plus", kind: "popup", width: 250, height: 512 })))
      .child(chatToggle())
      .when(enabled.includes("files"), el => el.child(panelButton("files", "Files", "mods/files/file.svg")))
      .when(enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/changes/changes.svg")))
      .when(w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/tabs-ref/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/tabs-ref/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/tabs-ref/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close"))));
  }
}
