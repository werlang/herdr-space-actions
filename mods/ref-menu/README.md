# ref-menu

Right-click a **tab** or a **terminal pane** in Herdr → **Copy reference**.

The clipboard gets one line, address first:

```
t9 — herdr · opencode working · "OC | Terminal tab IDs for agent sync" · tab "OpenCode" (tb…) · space "~" (sp…) · /Users/pablowerlang · hc: get/read/send/wait t9
```

`t9` is the herdr-core address another agent acts on:

```sh
hc get t9             # status, folder, labels, parent
hc read t9 --lines 80 # what it shows
hc send t9 "…"        # type into it and press enter
hc wait t9            # until it stops working or exits
```

On another machine the first token is `machine/t9` (e.g. `vps/t7`); `hc` takes
that form everywhere.

## How it is wired

Herdr's shipped `tabs` mod hard-codes `openOverlay({mod: "menu", …})` for tab
right-clicks, and shipped layouts cannot be edited structurally, so this is a
fork:

- `mods/ref-menu/` — clone of `menu` with the copy item (`ref.js` builds the line).
- `mods/tabs-ref/` — clone of `tabs` that opens `ref-menu` for tab right-clicks
  and sizes the popup to its rows.
- `layouts/werlang.json` — clone of `main`: the tabs block uses `tabs-ref`, and
  root `terminal_menu: "ref-menu"` routes pane right-clicks here too.

All three are personal (never updated by Herdr). The shipped `main`, `tabs` and
`menu` stay untouched; switch back with `cmd-shift-l` or
`herdr-app do layout.switch --name main`.

Pane right-click on a TUI that captures the mouse: **Shift+right-click** always
opens Herdr's menu. The pane item `Send right-clicks to pane` moves normal
right-clicks to the program; this menu stays on Shift+right-click.

`mod.open ref-menu` (or a key bound to it) opens the current tab's references
without right-clicking.
