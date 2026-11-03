# Herdr Space Actions

Right-click a **space** in Herdr's sidebar for two extra actions:

- **Pin space / Unpin space** — the space stays even when every terminal and agent in it is closed.
- **Open in VS Code** — opens the space's current folder in VS Code.

The menu keeps the existing Rename, New worktree / Open worktree / Remove worktree, and Close items.

![Herdr Space Actions](preview.png)

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

## Open in VS Code

- Local space: `code -n <folder>`.
- Remote space: `code --remote ssh-remote+<target> -n <folder>`, where `<target>` comes from `hc machine ls --json`. The remote must be configured in VS Code Remote SSH and the `code` CLI must be in `PATH`.

For pinned spaces, the folder is the fixed pinned location. For unpinned spaces, the folder is the first live terminal's current folder, else the space's creation folder.

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

`changes-plus` is a clone of the shipped Changes panel that reads the pinned folder: in a pinned space it shows that project's changes and its Git Graph button opens the graph on the same project, no matter where the focused terminal has `cd`'d. Keep the shipped `changes` mod untouched.

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
herdr-app status
```

## Repository

Source of truth for the mods. After edits:

```sh
./sync.sh
```

It syncs `spaces-plus`, `changes-plus`, `space-menu`, `space-pin`, `new-menu-plus`, and `agents-plus` to the live Herdr folder and runs `herdr-app check` for each. See `AGENTS.md`.

## Publish

This repo is an app-mod repo. To share it on `herdr.dev/mods`:

- keep `mods/spaces-plus`, `mods/changes-plus`, `mods/space-menu`, `mods/space-pin`, `mods/new-menu-plus`, and `mods/agents-plus` at the root;
- keep `RECIPE.md` and `preview.png`;
- add the topic `herdr-mod`;
- make the repository public.

See `.agents/skills/herdr-publish/SKILL.md` and `references/publishing.md` for the full checklist.
