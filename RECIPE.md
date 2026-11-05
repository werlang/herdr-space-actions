# Space Actions & Persistent Workspaces

Right-click a **space** in Herdr's sidebar for **Pin space** and **Open in VS Code**, alongside the usual rename/worktree/close items. View git branch and dirty worktree status directly in the spaces list, and sort spaces intelligently.

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

Each space in a Git repo shows a secondary line with the branch name, colored dots for uncommitted changes (conflicts, staged, modified, untracked), and push/pull counters (`↑`/`↓`).

## How it behaves

- Pinning stores the space id in `shared("spaces.pinned")`, locks its location in `shared("spaces.pinned_locations")`, and creates a **New tab** placeholder backed by `space-pin`. It opens a small New tab screen with Terminal and installed-agent shortcuts. If every terminal/agent in the space closes, the placeholder tab remains, so the space stays.
- After pinning, the space's location is fixed: terminal `cd` commands do not alter the space's location or its sidebar git info. Only unpinned spaces follow terminal `cd`.
- The **Changes** panel (`changes-plus`) keeps showing the pinned project's changes, and its Git Graph button opens the graph for that same project, even when a terminal in the space has `cd`'d elsewhere.
- Opening a new terminal or agent via the UI `+` button (`new-menu-plus`) opens directly in the space's folder (or fixed pinned location), rather than the current directory of the focused terminal.
- `spaces-plus.newTerminal`, optionally bound to `cmd+t` when `herdr-tab-actions` is not mounted, starts a terminal tab in the pinned location; unpinned spaces keep Herdr's default.
- With `herdr-tab-actions` mounted, `cmd+t` should point at `tabs-ref.newTab` instead: it opens or selects the **New tab** placeholder, and the tab bar owns hiding/showing it.
- Clicking an agent in the **Agents** panel (`agents-plus`) selects that agent's space before showing its pane, so the Spaces list and the Changes/Files panels follow the agent. Sub-agent rows select the parent's space before peeking.
- The placeholder tab shows the new-tab icon, the space name, the folder, and a menu with **Terminal** and installed agents (`T`/Enter, `1`–`9`).
- Unpinning closes the placeholder tab and unlocks its location to follow terminal `cd` again. If it was the only tab, the space closes normally.
- **Close** still closes the space explicitly; the pin protects against an empty space, not against Close.
- **Open in VS Code** runs `code -n <folder>` locally. For a remote space it runs `code --remote ssh-remote+<target> -n <folder>`, resolving the SSH target from `hc machine ls --json`.
- For pinned spaces, the folder is the fixed pinned location. For unpinned spaces, the folder is the first live terminal's current folder, else the space's creation folder.

## Built from

- `mods/spaces-plus/` — clone of the shipped `spaces`; right-click opens `space-menu`, rows show `pin.svg` for pinned ids, displays git status/branch, supports smart sorting, and answers `spaces-plus.newTerminal`.
- `mods/space-menu/` — the popup menu, items, icons, keyboard handling, pin toggle, VS Code launch, and worktree/close actions.
- `mods/space-pin/` — the New tab placeholder pane; `tab.new { mod: "space-pin", props: { space } }` keeps an empty pinned space alive and offers terminal/agent shortcuts.
- `mods/new-menu-plus/` — the `+` menu clone ensuring new terminals and agents launch in the space's folder instead of the focused terminal's `cd` folder.
- `mods/changes-plus/` — clone of the shipped `changes` panel; reads `shared("spaces.pinned_locations")` for the active space.
- `mods/agents-plus/` — clone of the shipped `agents` panel; row clicks run `space.select` for the agent's space before `pane.focus`.
- `shared("spaces.pinned")` — app-wide pinned space ids.
- `shared("spaces.pinned_locations")` — locked locations for pinned spaces.

## Watch out

- The pinned placeholder is a real tab named **New tab**. If using the companion mod [`herdr-tab-actions`](https://github.com/werlang/herdr-tab-actions) (`tabs-ref`), it is hidden automatically while other tabs exist; otherwise, it stays visible as a tab.
- Tab-bar behavior (`cmd+t`/New tab, `cmd+1..9`, `cmd+w`, hiding the placeholder) belongs to `herdr-tab-actions`. This repo owns the placeholder UI and the pinned-folder launch.
- If the user closes the placeholder tab itself and no other tabs remain, the space closes.
- The `code` CLI must be in `PATH`; without it the action reports a notification instead of opening VS Code.
- Do not rename `spaces-plus`, `space-menu`, `space-pin`, `new-menu-plus`, `changes-plus`, or `agents-plus`.

## Done when

- `herdr-app check` passes for all 6 mods.
- Right-clicking a space shows Pin/Unpin and Open in VS Code, plus the existing items.
- The spaces header sort menu offers Manual order, Alphabetical, Priority, Uncommitted changes, Unpushed commits, and Last activity.
- Pinning adds the New tab placeholder and the row pin icon; closing all terminals/agents leaves the space.
- Unpinning removes the placeholder; if the space is empty it closes normally.
- Open in VS Code opens the right folder.
- `herdr-app status` reports no errors.
