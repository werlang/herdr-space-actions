// The placeholder pane a pinned space keeps when every terminal/agent closes.
// It is a normal mod tab (`tab.new { mod: "space-pin" }`), so the space survives
// an empty tab set. Right-click the space to unpin it.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, spaces, panes, run, theme } from "herdr";

function place(space) {
  const tabs = new Set((space.tabs ?? []).map((tab) => tab.id));
  return panes().find((pane) => tabs.has(pane.tab) && pane.cwd)?.cwd || space.folder;
}

export default class SpacePin extends View {
  render() {
    const t = theme();
    const value = props() ?? {};
    const space = spaces().find((candidate) => candidate.id === value.space)
      ?? spaces().find((candidate) => candidate.active)
      ?? null;
    const folder = space && place(space);
    return v_flex().size_full().bg(t.surface).items_center().justify_center().gap(10).p(24)
      .child(svg("mods/space-pin/pin.svg").size(30).flex_none().text_color(t.accent))
      .child(div().text_size(15).text_color(t.foreground).child("Pinned space"))
      .when(Boolean(space), el => el.child(div().text_size(12).text_color(t.muted).child(space.name)))
      .when(Boolean(folder), el => el.child(div().max_w(520).truncate().text_size(11).text_color(t.dim).child(folder)))
      .when(Boolean(space), el => el.child(h_flex().mt(4).id("space-pin-new").px(10).py(5).rounded(6)
        .bg(t.raised).text_size(12).text_color(t.foreground).hover((s) => s.bg(t.hover))
        .on_click(() => run("tab.new", { space: space.id }))
        .child("New terminal")));
  }
}
