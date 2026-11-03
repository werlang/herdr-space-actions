# herdr-space-actions

Fonte da verdade do plugin de ações de **space** do Herdr:

- `mods/spaces-plus` — clone do `spaces` que abre o `space-menu` no right-click e mostra o ícone de pin.
- `mods/changes-plus` — clone do painel `changes` que lê o local fixado do space pinado: mostra as mudanças do projeto pinado e o botão Git Graph abre o graph no mesmo projeto, mesmo que um terminal tenha feito `cd` para outro repositório.
- `mods/agents-plus` — clone do painel `agents`: clicar numa linha de agent (inclusive sub-agent) seleciona o space do agent antes de mostrar o pane, então o projeto na lista de spaces e os painéis de Changes/Files acompanham.
- `mods/space-menu` — menu com **Pin space / Unpin space**, **Open in VS Code**, Rename, worktree e Close.
- `mods/space-pin` — a aba placeholder que mantém um space pinado vivo quando todos os terminais/agents fecham.
- `mods/new-menu-plus` — menu do botão `+` que abre terminais e agents no local do space (ou local fixado do pin) em vez do `cwd` do terminal com foco.

## Comando `newTerminal`

O `spaces-plus` atende `spaces-plus.newTerminal` via `nextCommand()`: abre uma aba de terminal no local fixado do space pinado (ou no `cwd` do terminal com foco, se o space não for pinado). Serve para ligar o `cmd+t` a ele quando o Herdr passaria a usar a pasta de criação do space:

```json
"cmd-t": "spaces-plus.newTerminal"
```

Só funciona enquanto o `spaces-plus` estiver montado no layout atual; em layouts sem ele, mantenha `tab.new`.

## Regra: sempre atualizar a pasta live do Herdr

O Herdr lê os mods de `~/.config/herdr-app/mods/<nome>`. Depois de **qualquer** mudança aqui:

```sh
./sync.sh
```

O script copia `spaces-plus`, `changes-plus`, `space-menu`, `space-pin`, `new-menu-plus` e `agents-plus` para a pasta live e roda `herdr-app check` neles. Não edite a pasta live diretamente.

## Ligação no layout

O layout pessoal `~/.config/herdr-app/layouts/werlang.json` aponta os blocos `spaces` e `agents` para os clones:

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

Os `spaces` e `agents` originais do Herdr continuam intocados. Se o layout for resetado, reponha `spaces-plus` e `agents-plus`.

## Pin

O estado fica em `shared("spaces.pinned")` e `shared("spaces.pinned_locations")`. Ao pinar, o mod congela o local do space naquele momento e cria uma aba `Pinned space` com o mod `space-pin`; ela é o que sobra quando os terminais/agents fecham. Terminais executando `cd` dentro de um space pinado não alteram seu local nem sua ramificação/status git; apenas spaces não pinados acompanham o `cd` dos terminais. O `tabs-ref` ativo esconde a aba placeholder enquanto o space tem outras abas; ela aparece só quando é a única. Ao despinar, a aba é fechada e o space volta a seguir o `cd` dos terminais. O item **Close** do menu continua fechando o space explicitamente.

## Skill

A skill `herdr-publish` está em `.agents/skills/herdr-publish/SKILL.md`. Ela cobre validação, sync, `RECIPE.md`/`preview.png` e publicação em `herdr.dev/mods` com o tópico `herdr-mod`.
