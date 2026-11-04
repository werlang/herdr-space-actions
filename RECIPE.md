# Space & Tab Actions

Right-click a **space** in Herdr's sidebar for **Pin space** and **Open in VS Code**, alongside the usual rename/worktree/close items. Right-click a **tab** for **Pin tab** and **Copy reference**, and right-click a **terminal pane** for **Copy reference**.

![Space Actions](preview.png)

## What you see

The spaces sidebar gains a small pin icon on pinned rows. Right-clicking a space opens a compact menu with a header showing the space name, then:

- **Pin space** / **Unpin space** — pinned rows show the pin icon.
- **Open in VS Code** — opens the space's folder in a new VS Code window.
- separator
- **Rename**
- **New worktree** / **Open worktree** (and **Remove worktree** for a linked worktree)
- separator
- **Close**

The menu is keyboard-navigable: ↑/↓ move, Enter runs, Esc closes.

The spaces header has a sort button: **Manual order** (drag to reorder), **Alphabetical**, **Priority** (blocked, idle, done, then others), **Uncommitted changes**, **Unpushed commits**, and **Last activity**. The mode is stored in `shared("spaces.sort")`; sorting is visual and does not reorder Herdr's model.

The tab bar (`tabs-ref`) opens the same `ref-menu` on right-click. Its menu has one **Copy reference** row per live terminal, then:

- **Pin tab** / **Unpin tab** — pinned tabs show a pin icon and sit first among regular tabs.
- **Rename**
- **New tab**
- separator
- **Close**

## How it behaves

- Pinning stores the space id in `shared("spaces.pinned")`, locks its location in `shared("spaces.pinned_locations")`, and creates a **Pinned space** tab backed by `space-pin`. If every terminal/agent in the space closes, the placeholder tab remains, so the space stays.
- After pinning, the space's location is fixed: terminal `cd` commands do not alter the space's location or its sidebar git info. Only unpinned spaces follow terminal `cd`.
- The **Changes** panel (`changes-plus`) keeps showing the pinned project's changes, and its Git Graph button opens the graph for that same project, even when a terminal in the space has `cd`'d elsewhere.
- Opening a new terminal or agent via the UI `+` button (`new-menu-plus`) opens directly in the space's folder (or fixed pinned location), rather than the current directory of the focused terminal.
- `spaces-plus.newTerminal`, optionally bound to `cmd+t`, starts a tab in the pinned location; unpinned spaces keep Herdr's default.
- Clicking an agent in the **Agents** panel (`agents-plus`) selects that agent's space before showing its pane, so the Spaces list and the Changes/Files panels follow the agent. Sub-agent rows select the parent's space before peeking.
- The placeholder tab shows the pin icon, the space name, the folder, and a **New terminal** button.
- Unpinning closes the placeholder tab and unlocks its location to follow terminal `cd` again. If it was the only tab, the space closes normally.
- **Close** still closes the space explicitly; the pin protects against an empty space, not against Close.
- **Open in VS Code** runs `code -n <folder>` locally. For a remote space it runs `code --remote ssh-remote+<target> -n <folder>`, resolving the SSH target from `hc machine ls --json`.
- For pinned spaces, the folder is the fixed pinned location. For unpinned spaces, the folder is the first live terminal's current folder, else the space's creation folder.
- **Pin tab** stores the tab id in `shared("tabs.pinned")` and moves the tab to the front of the regular tabs. `tabs-ref` reorders the model with `tab.move`, so pinned tabs stay first after drags, new tabs, and restarts. The list survives closing and reopening Herdr; ids of closed tabs remain harmless because ids are never reused.
- `cmd+w` is bound to `tabs-ref.closeTab`. On a pinned tab it does not close: it selects the closest other tab (a tie goes right). On an unpinned tab it runs `tab.close`.
- **Copy reference** puts the terminal's `hc` address first, followed by its app/state, tab, space, and folder. On another machine the address is `machine/address`.
- On a TUI that captures the mouse, **Shift+right-click** opens the pane menu.

## Built from

- `mods/spaces-plus/` — clone of the shipped `spaces`; right-click opens `space-menu`, rows show `pin.svg` for pinned ids, and it answers `spaces-plus.newTerminal` with the pinned folder.
- `mods/space-menu/` — the popup menu, items, icons, keyboard handling, pin toggle, VS Code launch, and the existing worktree/close actions. It reads `shared("spaces.pinned")` and uses `tab.new`/`tab.close` for the placeholder.
- `mods/space-pin/` — the placeholder pane; `tab.new { mod: "space-pin", props: { space } }` keeps a tab in the space alive.
- `mods/new-menu-plus/` — the `+` menu clone ensuring new terminals and agents launch in the space's folder instead of the focused terminal's cd folder.
- `mods/changes-plus/` — clone of the shipped `changes` panel; reads `shared("spaces.pinned_locations")` for the active space and ships its own icons.
- `mods/agents-plus/` — clone of the shipped `agents` panel; row clicks run `space.select` for the agent's space before `pane.focus` (sub-agent rows select the parent's space before `terminal.peek`).
- `mods/ref-menu/` — clone of the shipped `menu`; adds the `ref.copy` item (clipboard writing per platform) and the Pin/Unpin tab item. `ref.js` builds the reference line without importing `herdr`, so it can be tested in plain Node.
- `mods/tabs-ref/` — clone of the shipped `tabs`; opens `ref-menu` on right-click, sizes the popup to its rows, renders the pin, reorders pinned tabs, and answers `tabs-ref.closeTab` / `tabs-ref.pin`.
- `shared("spaces.pinned")` — app-wide pinned space ids.
- `shared("tabs.pinned")` — app-wide pinned tab ids.
- `hc(["machine", "ls", "--json"])` — remote SSH target for VS Code.
- The personal layout `werlang.json` points the `spaces`, `agents`, and `tabs` blocks at the clones, and the root `terminal_menu` at `ref-menu`.

## Watch out

- The pinned placeholder is a real tab named **Pinned space**. The active `tabs-ref` tab bar hides it while the space has other tabs; it appears only when it is the only tab left. That is what keeps the space alive without an extra visible tab.
- If the user closes the placeholder tab itself and no other tabs remain, the space closes. Re-pin it or keep at least one tab.
- **Both tab mods are required.** `tabs-ref` depends on `ref-menu`; installing only one loses either the tab menu or the pane menu.
- `cmd+w` must point at `tabs-ref.closeTab` (not `tab.close`) for pinned tabs to protect themselves. Without `tabs-ref` mounted, keep `tab.close`.
- Remote pinning depends on the remote core accepting a mod tab; the VS Code remote action assumes the Herdr machine target is a valid VS Code Remote SSH host.
- The `code` CLI must be in `PATH`; without it the action reports a notification instead of opening VS Code.
- Linux **Copy reference** needs `wl-copy` or `xclip`.
- Do not rename `spaces-plus`, `space-menu`, `space-pin`, `ref-menu`, or `tabs-ref`: the asset paths and `openOverlay`/`tab.new` references use those names.
- The shipped `spaces`, `changes`, `agents`, `tabs`, and `menu` mods remain untouched; only the personal layout points at the clones.

## Done when

- `herdr-app check` passes for `spaces-plus`, `changes-plus`, `space-menu`, `space-pin`, `new-menu-plus`, `agents-plus`, `ref-menu`, and `tabs-ref`.
- Right-clicking a space shows Pin/Unpin and Open in VS Code, plus the existing items.
- The spaces header sort menu offers Manual order, Alphabetical, Priority, Uncommitted changes, Unpushed commits, and Last activity, and remembers the choice.
- Pinning adds the Pinned space tab and the row pin icon; closing all terminals/agents leaves the space.
- Unpinning removes the placeholder; if the space is empty it closes normally.
- Right-clicking a tab shows Pin/Unpin and Copy reference; a pinned tab moves first and shows the pin icon.
- `cmd+w` on a pinned tab selects the closest tab instead of closing it.
- Open in VS Code opens the right folder (or reports a clear error when `code` is missing).
- `herdr-app status` reports no errors.
