# Herdr Space Actions

Right-click a **space** in Herdr's sidebar for two extra actions:

- **Pin space / Unpin space** — the space stays even when every terminal and agent in it is closed.
- **Open in VS Code** — opens the space's current folder in VS Code.

The menu keeps the existing Rename, New worktree / Open worktree / Remove worktree, and Close items.

Right-click a **tab** for **Pin tab** and **Copy reference**, and a **terminal pane** for **Copy reference**.

![Herdr Space Actions](preview.png)

## Git state in the spaces list

Each space that lives in a git repository grows a second, smaller line under its name:

- the checked-out branch, prefixed by the repository name when the space name does not already say it (main and master are no longer hidden);
- colored dots for a dirty worktree: red for conflicts, green for staged changes, orange for modified files, blue for untracked files (hover a dot to see how many);
- green `↑n` for commits still to push and red `↓n` for commits still to pull.

Clean rows show no dots and no arrows. Non-repository spaces keep the compact single-line row.

## Sorting the spaces list

The **Spaces** header has a sort button. It opens a small menu with:

- **Manual order** — Herdr's own order; drag rows to reorder (the other modes disable dragging).
- **Alphabetical** — A to Z by space name.
- **Priority** — a blocked agent (needs you), then idle, then done, then working or quiet spaces.
- **Uncommitted changes** — the most dirty files first.
- **Unpushed commits** — the most commits still to push first.
- **Last activity** — the most recent state change first.

The choice is stored in `shared("spaces.sort")` and persisted. Sorting is visual: it never calls `space.move`, so `cmd+1..9`, `space.next`, and `space.prev` keep following Herdr's model order. Worktrees stay nested under their main checkout; the main row takes the best number from its worktrees (highest priority, sum of changes/commits, newest activity), so an urgent worktree lifts its whole repository into view.

## Pin behavior

Pinning writes the space id to `shared("spaces.pinned")`, locks its location into `shared("spaces.pinned_locations")`, and adds a **Pinned space** tab backed by the `space-pin` mod. That tab is a placeholder, not a terminal: if every terminal and agent in the space closes, the placeholder tab is still there, so the space remains. The sidebar row shows a pin icon while it is pinned.

After pinning, the space's location is fixed: running `cd` in terminals inside the space does not change its tracked location, git repo, branch status, or VS Code target folder. Only unpinned spaces follow terminal `cd`.

Opening a new terminal or agent via the UI `+` button (`new-menu-plus`) opens directly in the space's folder (or fixed pinned location), rather than the current directory of the focused terminal.

### Where `cmd+t` starts

Herdr's built-in `tab.new` starts a terminal in the space's **creation folder** (the folder the space was created in, which defaults to the focused terminal's folder at that moment). Pinning does not rewrite it, and Herdr has no command to change it afterwards — so a space created in the wrong project keeps opening new tabs there, even after it is pinned to the right one.

Two ways around it:

- Use the `+` menu (`new-menu-plus`), which starts the terminal in the pinned location.
- Bind `cmd+t` to `spaces-plus.newTerminal`, which does the same in one keystroke:

  ```json
  "cmd-t": "spaces-plus.newTerminal"
  ```

  It uses the pinned folder for pinned spaces and keeps Herdr's default for unpinned ones (the focused terminal's cwd, else the space folder). It works while `spaces-plus` is the sidebar in the current layout; a layout without it would make the binding do nothing, so keep `tab.new` for those.

The only way to change the stored creation folder itself is to recreate the space with the folder you want (`space.new { name, folder }`).

While the space has other tabs, the active `tabs-ref` tab bar hides that placeholder; it appears only when it is the only tab left. That keeps the space alive without an extra tab in the way. If you use a different tab bar, the placeholder stays visible.

Unpinning closes the placeholder tab, unlocks its location so it follows terminal `cd` again, and if it was the only tab left, the space closes (normal behavior). The explicit **Close** item still closes the space; the pin protects against an empty space, not against choosing Close.

## Agents pane

`agents-plus` is a clone of the shipped **Agents** panel. Clicking an agent row selects that agent's space (project) before showing its pane, so the Spaces list highlight and the Changes/Files panels follow the agent. Sub-agent rows select the parent agent's space before peeking at the sub-agent terminal.

## Tabs: pinning and references

`tabs-ref` is a clone of the shipped tab bar and `ref-menu` is a clone of the shipped context menu:

- **Right-click a tab** for its menu: **Pin tab** / **Unpin tab**, **Copy reference** rows, Rename, New tab, and Close.
- Pinned tabs show a pin icon and always sit before regular unpinned tabs. The pinned-space placeholder is kept last (and stays hidden while other tabs exist).
- Pin state lives in `shared("tabs.pinned")` and persists across closing and reopening Herdr. Ids of tabs closed while pinned stay in the list but are harmless: tab ids are never reused. Only **Unpin tab** removes an id.
- **`cmd+w` never closes a pinned tab.** It selects the closest other tab instead. Unpinned tabs close normally. Bind the key to the tab bar so it can decide:

  ```json
  "cmd-w": "tabs-ref.closeTab"
  ```

- **Copy reference** copies the `hc` address of the terminal plus its tab/space/folder context, so another agent can use `hc get/read/send/wait <address>`.
- Right-clicking a terminal pane uses the same `ref-menu` through the layout root's `"terminal_menu": "ref-menu"`.

## Open in VS Code

- Local space: `code -n <folder>`.
- Remote space: `code --remote ssh-remote+<target> -n <folder>`, where `<target>` comes from `hc machine ls --json`. The remote must be configured in VS Code Remote SSH and the `code` CLI must be in `PATH`.

For pinned spaces, the folder is the fixed pinned location. For unpinned spaces, the folder is the first live terminal's current folder, else the space's creation folder.

## Requirements

- Herdr app.
- VS Code only for the **Open in VS Code** action: install the `code` command in `PATH`.
- Remote spaces additionally need VS Code Remote SSH and an SSH target known to Herdr.
- **Copy reference** needs a clipboard writer: `osascript` on macOS (built in), PowerShell on Windows, or `wl-copy`/`xclip` on Linux.

## Install

Sync the mods into `~/.config/herdr-app/mods/`, then point a **personal layout** at the clones:

```json
{
  "id": "spaces",
  "type": "block",
  "content": { "mod": "spaces-plus" }
}
```

```json
{
  "id": "changes",
  "type": "block",
  "content": { "mod": "changes-plus" }
}
```

```json
{
  "id": "agents",
  "type": "block",
  "content": { "mod": "agents-plus" }
}
```

The tab bar and its right-click menu are a separate pair. Point the `tabs` block at `tabs-ref` and the layout root at `ref-menu`:

```json
{
  "id": "tabs",
  "type": "block",
  "content": { "mod": "tabs-ref" }
}
```

```json
"terminal_menu": "ref-menu"
```

`changes-plus` is a clone of the shipped Changes panel that reads the pinned folder: in a pinned space it shows that project's changes and its Git Graph button opens the graph on the same project, no matter where the focused terminal has `cd`'d. It also watches the selected space, so switching spaces reloads it immediately even when the new space has no terminal to focus. Keep the shipped `changes` mod untouched.

Keep the shipped `spaces` and `agents` mods untouched. If the layout is shipped, clone it first:

```sh
herdr-app do layout.clone --name main --as my-layout
```

Then:

```sh
herdr-app check ~/.config/herdr-app/mods/spaces-plus
herdr-app check ~/.config/herdr-app/mods/changes-plus
herdr-app check ~/.config/herdr-app/mods/space-menu
herdr-app check ~/.config/herdr-app/mods/space-pin
herdr-app check ~/.config/herdr-app/mods/new-menu-plus
herdr-app check ~/.config/herdr-app/mods/agents-plus
herdr-app check ~/.config/herdr-app/mods/ref-menu
herdr-app check ~/.config/herdr-app/mods/tabs-ref
herdr-app status
```

## Repository

Source of truth for the mods. After edits:

```sh
./sync.sh
```

It syncs `spaces-plus`, `changes-plus`, `space-menu`, `space-pin`, `new-menu-plus`, `agents-plus`, `ref-menu`, and `tabs-ref` to the live Herdr folder and runs `herdr-app check` for each. See `AGENTS.md`.

## Publish

This repo is an app-mod repo. To share it on `herdr.dev/mods`:

- keep `mods/spaces-plus`, `mods/changes-plus`, `mods/space-menu`, `mods/space-pin`, `mods/new-menu-plus`, `mods/agents-plus`, `mods/ref-menu`, and `mods/tabs-ref` at the root;
- keep `RECIPE.md` and `preview.png`;
- add the topic `herdr-mod`;
- make the repository public.

See `.agents/skills/herdr-publish/SKILL.md` and `references/publishing.md` for the full checklist.
