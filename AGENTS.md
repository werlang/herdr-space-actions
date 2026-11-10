# herdr-space-actions

Fonte da verdade do plugin de ações de **space** do Herdr:

- `mods/spaces-plus` — clone do `spaces` que abre o `space-menu` no right-click, mostra o ícone de pin, mostra sob cada space o branch, a cor de merge/commits não enviados/mudanças locais no nome do space e as setas de commits para push/pull, e ordena a lista pelo botão do cabeçalho (alfabética, prioridade, mudanças não commitadas, commits não enviados ou última atividade).
- `mods/changes-plus` — clone do painel `changes` que lê o local fixado do space pinado: mostra as mudanças do projeto pinado e o botão Git Graph abre o graph no mesmo projeto, mesmo que um terminal tenha feito `cd` para outro repositório. Acompanha a troca de space na hora, mesmo quando o novo space não tem terminal com foco.
- `mods/agents-plus` — clone do painel `agents`: clicar numa linha de agent (inclusive sub-agent) seleciona o space do agent antes de mostrar o pane, então o projeto na lista de spaces e os painéis de Changes/Files acompanham.
- `mods/space-menu` — menu com **Pin space / Unpin space**, **Open in VS Code**, **Open in Finder/Explorer** (conforme o sistema), Rename, worktree e Close.
- `mods/space-pin` — a aba placeholder **New tab** que mantém um space pinado vivo quando todos os terminais/agents fecham e oferece atalhos de terminal/agent para o space.
- `mods/new-menu-plus` — menu do botão `+` que abre terminais e agents no local do space (ou local fixado do pin) em vez do `cwd` do terminal com foco.
- `mods/worktree-plus` — clone do diálogo `worktree` com o visual dos modais do plugin (New, Open e Remove worktree); abre no local do space.

## Comando `newTerminal`

O `spaces-plus` atende `spaces-plus.newTerminal` via `nextCommand()`: abre uma aba de terminal no local fixado do space pinado (ou no `cwd` do terminal com foco, se o space não for pinado). Serve para ligar o `cmd+t` a ele quando o Herdr passaria a usar a pasta de criação do space, em layouts sem `herdr-tab-actions`:

```json
"cmd-t": "spaces-plus.newTerminal"
```

Só funciona enquanto o `spaces-plus` estiver montado no layout atual; em layouts sem ele, mantenha `tab.new`.

### New tab e foco

Com `herdr-tab-actions` montado, `cmd+t` deve apontar para `tabs-ref.newTab`: ele abre ou seleciona a aba `New tab` do `space-pin`. O `spaces-plus.newTerminal` continua sendo o atalho para abrir um terminal no local fixado. Sem `tabs-ref`, use `spaces-plus.newTerminal` (ou `tab.new`).

Depois de criar ou selecionar o placeholder, a cópia visível do `space-pin` recebe o foco pelo timer de 50 ms; `T`/Enter abrem um terminal e `1`–`9` abrem o agent. O `focus()` nunca é chamado no `render()`, e cada cópia só age quando `props().space` é o space ativo.

## Mods independentes

Nenhum mod deste repo tem dependência obrigatória de outro mod (deste repo ou de outro). Toda integração é opcional: o mod lê `mods/<nome>/mod.json` na pasta live (`readTextFile(`${appHome()}/mods/<nome>/mod.json`)`) e, sem o outro mod, cai no equivalente do Herdr ou esconde o recurso:

- `spaces-plus`: sem `space-menu` abre o `menu` do Herdr (`{ tab: "space", target: { id } }`); sem `space-pin` o `ensurePinTabs` não cria placeholder. Re-checa a cada 5 s.
- `space-menu`: sem `space-pin` esconde **Pin space** (mantém **Unpin** para spaces já pinados) e não cria placeholder; sem `worktree-plus` abre o `worktree` do Herdr (mesmas props).
- `new-menu-plus`: sem `worktree-plus` abre o `worktree` do Herdr.
- `changes-plus`: sem `git-graph` esconde o botão Git Graph. Re-checa a cada 5 s.

Ícones vêm só da própria pasta do mod ou dos mods shipped (`workspace-chrome`, `pane`); nunca de outro mod custom. Ao adicionar uma integração nova, siga o mesmo padrão.

## Limite de publicação

A barra de abas e o comportamento de abas (`cmd+t`/New tab, `cmd+1..9`, `cmd+w` e esconder/mostrar o placeholder) pertencem ao repo `herdr-tab-actions` (`tabs-ref`). Aqui ficam o painel de spaces, o pin e a UI do placeholder `space-pin`. O `ensurePinTabs` do `spaces-plus` é fallback para spaces em segundo plano e para layouts sem `tabs-ref`.

## Ordenação dos spaces

O cabeçalho do `spaces-plus` tem um botão de ordenação que abre um popup com:

- **Manual order** — a ordem do próprio Herdr, com arrastar para reordenar;
- **Alphabetical**;
- **Priority** — blocked (requer ação), idle, done, depois working e spaces sem status;
- **Uncommitted changes** — mais arquivos sujos primeiro;
- **Unpushed commits** — mais commits para push primeiro;
- **Last activity** — mudança de estado mais recente primeiro.

Abaixo dos modos, o toggle **Keep pinned spaces first** mantém os spaces pinados no topo de qualquer modo de ordenação. Fica em `shared("spaces.pinned_first")` e não afeta a ordem manual, onde o arrastar continua mandando. Uma linha de repositório também conta como pinada quando uma de suas worktrees está pinada.

O modo escolhido fica em `shared("spaces.sort")`. A ordenação é só visual: não chama `space.move`, então `cmd+1..9`, `space.next` e `space.prev` continuam na ordem do modelo. Worktrees continuam aninhadas sob o checkout principal; a linha principal usa o agregado das worktrees (prioridade máxima, soma de mudanças/commits, atividade mais recente), então uma worktree urgente sobe junto com o repo. O arrastar para reordenar aparece só no modo manual.

## Regra: sempre atualizar a pasta live do Herdr

O Herdr lê os mods de `~/.config/herdr-app/mods/<nome>`. Depois de **qualquer** mudança aqui:

```sh
./sync.sh
```

O script copia `spaces-plus`, `changes-plus`, `space-menu`, `space-pin`, `new-menu-plus`, `agents-plus` e `worktree-plus` para a pasta live e roda `herdr-app check` neles. Não edite a pasta live diretamente.

## Ligação no layout

O layout pessoal aponta os blocos `spaces` e `agents` para os clones:

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

Os `spaces`, `agents` e `changes` originais do Herdr continuam intocados.

## Pin

O estado fica em `shared("spaces.pinned")` e `shared("spaces.pinned_locations")`. Ao pinar, o mod congela o local do space naquele momento e cria uma aba `New tab` com o mod `space-pin`; ela é o que sobra quando os terminais/agents fecham. Terminais executando `cd` dentro de um space pinado não alteram seu local nem sua ramificação/status git; apenas spaces não pinados acompanham o `cd` dos terminais. Ao despinar, a aba é fechada e o space volta a seguir o `cd` dos terminais. O item **Close** do menu continua fechando o space explicitamente.

> Se você deseja que a aba placeholder seja escondida automaticamente enquanto houver outras abas no space, instale o pacote `herdr-tab-actions` (`tabs-ref`).

## Skill

A skill `herdr-publish` está em `.agents/skills/herdr-publish/SKILL.md`. Ela cobre validação, sync, `RECIPE.md`/`preview.png` e publicação em `herdr.dev/mods` com o tópico `herdr-mod`.
