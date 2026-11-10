# Herdr Space Actions

Right-click a **space** in Herdr's sidebar for extra actions and turn your spaces into persistent project workspaces:

- **Pin space / Unpin space** — the space stays even when every terminal and agent in it is closed, backed by a lightweight placeholder tab (`space-pin`).
- **Open in VS Code** — opens the space's current folder in VS Code (supports local projects and remote SSH machines).
- **Open in Finder / Explorer / File Manager** — reveals the space's current folder in the system file manager (macOS, Windows, or Linux).
- **Fixed project locations** — running `cd` inside terminals does not change the space's project directory or git status.
- **Git status inline** — view branch name, a status color on the space name (merge conflicts, unpushed commits, local changes), and push/pull commit arrows directly under each space row.
- **Smart sorting** — sort spaces by manual order, alphabetical, priority (blocked/idle/done agents), uncommitted changes, unpushed commits, or last activity.
- **Context synchronization** — clicking an agent in `agents-plus` automatically selects that agent's space; `changes-plus` keeps diffs focused on the space repo; `new-menu-plus` launches new terminals and agents directly in the space root.

The menu preserves existing space capabilities: Rename, New worktree / Open worktree / Remove worktree, and Close.

![Herdr Space Actions](preview.png)

## Git state in the spaces list

Each space that lives in a git repository grows a second, smaller line under its name:

- the checked-out branch, prefixed by the repository name when the space name does not already say it (main and master stay visible);
- the space name tinted by git state: red for a merge with conflicts, green for commits still to push (matching the `↑n` arrow), orange for staged, modified, or untracked files (hover the name to see every count);
- green `↑n` for commits still to push and red `↓n` for commits still to pull.

Clean rows show no tint and no arrows. Non-repository spaces keep the compact single-line row.

## Sorting the spaces list

The **Spaces** header has a sort button that opens a popup with:

- **Manual order** — Herdr's own order; drag rows to reorder.
- **Alphabetical** — A to Z by space name.
- **Priority** — a blocked agent (needs you), then idle, then done, then working or quiet spaces.
- **Uncommitted changes** — the most dirty files first.
- **Unpushed commits** — the most commits still to push first.
- **Last activity** — the most recent state change first.

Below the modes, **Keep pinned spaces first** keeps pinned spaces at the top of any sorted mode. It is stored in `shared("spaces.pinned_first")` and has no effect on manual order, where dragging stays in charge. A repository row also counts as pinned when one of its worktrees is pinned.

The choice is stored in `shared("spaces.sort")` and persisted. Sorting is visual: it never calls `space.move`, so `cmd+1..9`, `space.next`, and `space.prev` keep following Herdr's model order. Worktrees stay nested under their main checkout; the main row aggregates worktree numbers so an urgent worktree lifts its whole repository into view.

## Pin behavior

Pinning writes the space id to `shared("spaces.pinned")`, locks its location into `shared("spaces.pinned_locations")`, and adds a **New tab** placeholder backed by `space-pin`. It is not a terminal: it is a small New tab screen with Terminal and installed-agent shortcuts (`T`/Enter, `1`–`9`). If every terminal and agent in the space closes, the placeholder tab is still there, so the space remains. The sidebar row shows a pin icon while it is pinned.

After pinning, the space's location is fixed: running `cd` in terminals inside the space does not change its tracked location, git repo, branch status, or VS Code target folder. Only unpinned spaces follow terminal `cd`.

Opening a new terminal or agent via the UI `+` button (`new-menu-plus`) opens directly in the space's folder (or fixed pinned location), rather than the current directory of the focused terminal.

> **Tip:** If you also want this placeholder tab hidden automatically while other tabs exist in the space, install [`herdr-tab-actions`](https://github.com/werlang/herdr-tab-actions) (`tabs-ref`).

### Where `cmd+t` starts

Herdr's built-in `tab.new` starts a terminal in the space's creation folder. Pinning does not rewrite it.

- With [`herdr-tab-actions`](https://github.com/werlang/herdr-tab-actions) mounted, bind `cmd+t` to `tabs-ref.newTab`. It opens or selects the **New tab** placeholder, whose menu starts terminals and agents; the tab bar also owns hiding the placeholder while other tabs exist.
- Without `tabs-ref`, bind `cmd+t` to `spaces-plus.newTerminal`. It starts a terminal in the pinned folder for pinned spaces and keeps Herdr's default for unpinned ones. It works while `spaces-plus` is mounted in the layout.

```json
"cmd-t": "tabs-ref.newTab"
```

(or `"cmd-t": "spaces-plus.newTerminal"` when `tabs-ref` is not mounted)

## Agents and Changes panes

- **`agents-plus`** is a clone of the shipped **Agents** panel. Clicking an agent row selects that agent's space before showing its pane, so the Spaces list highlight and the Changes/Files panels follow the agent. Sub-agent rows select the parent agent's space before peeking at the sub-agent terminal.
- **`changes-plus`** is a clone of the shipped **Changes** panel that reads the pinned folder: in a pinned space it shows that project's changes and its Git Graph button opens the graph on the same project, no matter where the focused terminal has `cd`'d.

## Open in VS Code

- Local space: `code -n <folder>`.
- Remote space: `code --remote ssh-remote+<target> -n <folder>`, where `<target>` comes from `hc machine ls --json`.

For pinned spaces, the folder is the fixed pinned location. For unpinned spaces, the folder is the first live terminal's current folder, else the space's creation folder.

## Open in Finder / Explorer

The action follows the host system:

- macOS: `open <folder>` (Finder).
- Windows: `explorer <folder>` (File Explorer).
- Linux: `xdg-open <folder>` (default file manager).

It is hidden for remote spaces, since their folder lives on another machine. The same folder rules as **Open in VS Code** apply (pinned location first).

## Each mod works alone

Install all seven for the full feature, or only the ones you want: no mod here needs another, or a mod from another repo.

| Mod | Without its optional companion |
|---|---|
| `spaces-plus` | no `space-menu`: right-click opens Herdr's own menu · no `space-pin`: pinned spaces keep their folder and order, but no placeholder tab |
| `space-menu` | no `space-pin`: **Pin space** is hidden (Unpin still shows for spaces pinned earlier) · no `worktree-plus`: Herdr's own worktree dialog |
| `new-menu-plus` | no `worktree-plus`: Herdr's own worktree dialog |
| `changes-plus` | no [`git-graph`](https://github.com/werlang/herdr-git-graph): the Git Graph button is hidden |
| `agents-plus`, `space-pin`, `worktree-plus` | standalone |

Optional mods are detected from `~/.config/herdr-app/mods/`, so installing or turning one off applies live.

## Requirements

- Herdr app.
- VS Code only for the **Open in VS Code** action: install the `code` command in `PATH`.
- Remote spaces additionally need VS Code Remote SSH and an SSH target known to Herdr.

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

If using a shipped layout, clone it first:

```sh
herdr-app do layout.clone --name main --as my-layout
```

After wiring, run:

```sh
herdr-app check ~/.config/herdr-app/mods/spaces-plus
herdr-app check ~/.config/herdr-app/mods/changes-plus
herdr-app check ~/.config/herdr-app/mods/space-menu
herdr-app check ~/.config/herdr-app/mods/space-pin
herdr-app check ~/.config/herdr-app/mods/new-menu-plus
herdr-app check ~/.config/herdr-app/mods/agents-plus
herdr-app status
```

## Repository

Source of truth for the mods. After edits:

```sh
./sync.sh
```

## Publish

This repo is an app-mod repo. To share it on `herdr.dev/mods`:

- keep `mods/spaces-plus`, `mods/changes-plus`, `mods/space-menu`, `mods/space-pin`, `mods/new-menu-plus`, `mods/agents-plus`, and `mods/worktree-plus` at the root;
- keep `RECIPE.md` and `preview.png`;
- add the topic `herdr-mod`;
- make the repository public.
