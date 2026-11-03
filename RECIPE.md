# Space Actions

Right-click a space in Herdr's sidebar for **Pin space** and **Open in VS Code**, alongside the usual rename/worktree/close items.

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

## How it behaves

- Pinning stores the space id in `shared("spaces.pinned")` and creates a **Pinned space** tab backed by `space-pin`. If every terminal/agent in the space closes, the placeholder tab remains, so the space stays.
- The placeholder tab shows the pin icon, the space name, the folder, and a **New terminal** button.
- Unpinning closes the placeholder tab. If it was the only tab, the space closes normally.
- **Close** still closes the space explicitly; the pin protects against an empty space, not against Close.
- **Open in VS Code** runs `code -n <folder>` locally. For a remote space it runs `code --remote ssh-remote+<target> -n <folder>`, resolving the SSH target from `hc machine ls --json`.
- The folder is the first live terminal's current folder, else the space's creation folder.

## Built from

- `mods/spaces-plus/` — clone of the shipped `spaces`; right-click opens `space-menu`, and rows show `pin.svg` for pinned ids.
- `mods/space-menu/` — the popup menu, items, icons, keyboard handling, pin toggle, VS Code launch, and the existing worktree/close actions. It reads `shared("spaces.pinned")` and uses `tab.new`/`tab.close` for the placeholder.
- `mods/space-pin/` — the placeholder pane; `tab.new { mod: "space-pin", props: { space } }` keeps a tab in the space alive.
- `shared("spaces.pinned")` — app-wide pinned space ids.
- `hc(["machine", "ls", "--json"])` — remote SSH target for VS Code.
- The personal layout `werlang.json` points the `spaces` block at `spaces-plus`.

## Watch out

- The pinned placeholder is a real tab named **Pinned space**. The active `tabs-ref` tab bar hides it while the space has other tabs; it appears only when it is the only tab left. That is what keeps the space alive without an extra visible tab.
- If the user closes the placeholder tab itself and no other tabs remain, the space closes. Re-pin it or keep at least one tab.
- Remote pinning depends on the remote core accepting a mod tab; the VS Code remote action assumes the Herdr machine target is a valid VS Code Remote SSH host.
- The `code` CLI must be in `PATH`; without it the action reports a notification instead of opening VS Code.
- Do not rename `spaces-plus`, `space-menu`, or `space-pin`: the asset paths and `openOverlay`/`tab.new` references use those names.
- The shipped `spaces` mod remains untouched; only the personal layout points at the clone.

## Done when

- `herdr-app check` passes for `spaces-plus`, `space-menu`, and `space-pin`.
- Right-clicking a space shows Pin/Unpin and Open in VS Code, plus the existing items.
- Pinning adds the Pinned space tab and the row pin icon; closing all terminals/agents leaves the space.
- Unpinning removes the placeholder; if the space is empty it closes normally.
- Open in VS Code opens the right folder (or reports a clear error when `code` is missing).
- `herdr-app status` reports no errors.
