# herdr-space-actions

Source of truth for the Herdr **space** actions plugin:

- `mods/spaces-plus` — clone of `spaces` that opens `space-menu` on right-click, shows the pin icon, shows under each space the branch, merge/unpushed/dirty color on the space name, and push/pull commit arrows, and sorts the list via the header button (alphabetical, priority, uncommitted changes, unpushed commits, or last activity).
- `mods/changes-plus` — clone of the `changes` panel that reads the pinned space's fixed location: shows changes for the pinned project and the Git Graph button opens the graph in the same project, even if a terminal ran `cd` into another repository. Follows space switches immediately, even when the new space has no focused terminal.
- `mods/agents-plus` — clone of the `agents` panel: lists agents and regular terminals in the same sections (Needs you, Done, Working, Idle) or grouped by space, with an All/Agents/Terminals filter; a terminal shows its running command and idle shells fold into an "N idle shells" row. Clicking a row (including a sub-agent) selects the space before showing the pane, so the project in the spaces list and the Changes/Files panels follow along. Chat View (a mod pane in the same tab) keeps the selected terminal's agent: `focused().agent` does not apply to mod panes, so `selection.js` resolves the tab's terminal agent.
- `mods/space-menu` — menu with **Pin space / Unpin space**, **Open in VS Code**, **Open in Finder/Explorer** (per OS), Rename, worktree, and Close.
- `mods/space-pin` — the **New tab** placeholder tab that keeps a pinned space alive when all terminals/agents close and offers terminal/agent shortcuts for the space.
- `mods/new-menu-plus` — `+` button menu that opens terminals and agents in the space's location (or pinned location) instead of the focused terminal's `cwd`.
- `mods/worktree-plus` — clone of the `worktree` dialog styled to match the plugin's modals (New, Open, and Remove worktree); opens in the space's location.

## `newTerminal` command

`spaces-plus` handles `spaces-plus.newTerminal` via `nextCommand()`: it opens a terminal tab in the pinned space's fixed location (or in the focused terminal's `cwd` if the space is not pinned). Bind `cmd+t` to it when Herdr would otherwise use the space's creation folder, in layouts without `herdr-tab-actions`:

```json
"cmd-t": "spaces-plus.newTerminal"
```

Only works while `spaces-plus` is mounted in the current layout; in layouts without it, keep `tab.new`.

### New tab and focus

With `herdr-tab-actions` mounted, `cmd+t` should point to `tabs-ref.newTab`: it opens or selects the `space-pin` `New tab` tab. `spaces-plus.newTerminal` remains the shortcut to open a terminal in the pinned location. Without `tabs-ref`, use `spaces-plus.newTerminal` (or `tab.new`).

After creating or selecting the placeholder, the visible `space-pin` instance receives focus via the 50 ms timer; `T`/Enter opens a terminal and `1`–`9` opens the agent. `focus()` is never called in `render()`, and each instance only acts when `props().space` is the active space.

## Independent mods

No mod in this repo has a required dependency on any other mod (in this repo or another). Every integration is optional: the mod checks `mods/<name>/mod.json` in the live folder (`readTextFile(`${appHome()}/mods/<name>/mod.json`)`) and, if the other mod is absent, falls back to Herdr's built-in equivalent or hides the feature:

- `spaces-plus`: without `space-menu`, opens Herdr's `menu` (`{ tab: "space", target: { id } }`); without `space-pin`, `ensurePinTabs` does not create a placeholder. Re-checks every 5 s.
- `space-menu`: without `space-pin`, hides **Pin space** (keeps **Unpin** for already-pinned spaces) and does not create a placeholder; without `worktree-plus`, opens Herdr's `worktree` (same props).
- `new-menu-plus`: without `worktree-plus`, opens Herdr's `worktree`.
- `changes-plus`: without `git-graph`, hides the Git Graph button. Re-checks every 5 s.

Icons come only from the mod's own folder or from shipped mods (`workspace-chrome`, `pane`); never from another custom mod. Follow the same pattern when adding a new integration.

## Publishing boundary

The tab bar and tab behavior (`cmd+t`/New tab, `cmd+1..9`, `cmd+w`, and hiding/showing the placeholder) belong to the `herdr-tab-actions` repo (`tabs-ref`). This repo owns the spaces panel, pinning, and the `space-pin` placeholder UI. `ensurePinTabs` in `spaces-plus` is a fallback for background spaces and for layouts without `tabs-ref`.

## Sorting spaces

The `spaces-plus` header has a sort button that opens a popup with:

- **Manual order** — Herdr's own order, with drag-to-reorder;
- **Alphabetical**;
- **Priority** — blocked (needs action), idle, done, then working and spaces without status;
- **Uncommitted changes** — most dirty files first;
- **Unpushed commits** — most commits to push first;
- **Last activity** — most recent state change first.

Below the modes, the **Keep pinned spaces first** toggle keeps pinned spaces at the top of any sort mode. Stored in `shared("spaces.pinned_first")`, it does not affect manual order where dragging stays in control. A repository row also counts as pinned when one of its worktrees is pinned.

The chosen mode is stored in `shared("spaces.sort")`. Sorting is visual only: it does not call `space.move`, so `cmd+1..9`, `space.next`, and `space.prev` keep the model order. Worktrees stay nested under the main checkout; the main row aggregates its worktrees (highest priority, sum of changes/commits, most recent activity), so an urgent worktree bubbles up with its repo. Drag-to-reorder appears only in manual mode.

## Rule: always update Herdr's live folder

Herdr loads mods from `~/.config/herdr-app/mods/<name>`. After **any** change here:

```sh
./sync.sh
```

The script copies `spaces-plus`, `changes-plus`, `space-menu`, `space-pin`, `new-menu-plus`, `agents-plus`, and `worktree-plus` to the live folder and runs `herdr-app check` on them. Do not edit the live folder directly.

## Tests

Agent list selection lives in `mods/agents-plus/selection.js` (pure logic, no `herdr` imports):

```sh
node --test test/
```

## Layout wiring

The personal layout points the `spaces`, `agents`, and `changes` blocks to the clones:

```json
{
  "id": "spaces",
  "type": "block",
  "content": { "mod": "spaces-plus" }
}
```

```json
{
  "id": "agents",
  "type": "block",
  "content": { "mod": "agents-plus" }
}
```

```json
{
  "id": "changes",
  "type": "block",
  "content": { "mod": "changes-plus" }
}
```

Herdr's original `spaces`, `agents`, and `changes` remain untouched.

## Pin

State is stored in `shared("spaces.pinned")` and `shared("spaces.pinned_locations")`. When pinning, the mod freezes the space's location at that moment and creates a `New tab` tab using the `space-pin` mod; it is what remains when all terminals/agents close. Terminals running `cd` inside a pinned space do not alter its location or git branch/status; only unpinned spaces follow terminal `cd`. When unpinning, the placeholder tab is closed and the space resumes following terminal `cd`. The menu's **Close** item still closes the space explicitly.

> If you want the placeholder tab to be hidden automatically while other tabs exist in the space, install the `herdr-tab-actions` (`tabs-ref`) package.

## Skill

The `herdr-publish` skill is in `.agents/skills/herdr-publish/SKILL.md`. It covers validation, sync, `RECIPE.md`/`preview.png`, and publishing to `herdr.dev/mods` with the `herdr-mod` topic.
