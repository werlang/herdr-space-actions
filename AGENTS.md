# herdr-space-actions

Fonte da verdade do plugin de ações de **space** do Herdr:

- `mods/spaces-plus` — clone do `spaces` que abre o `space-menu` no right-click e mostra o ícone de pin.
- `mods/space-menu` — menu com **Pin space / Unpin space**, **Open in VS Code**, Rename, worktree e Close.
- `mods/space-pin` — a aba placeholder que mantém um space pinado vivo quando todos os terminais/agents fecham.

## Regra: sempre atualizar a pasta live do Herdr

O Herdr lê os mods de `~/.config/herdr-app/mods/<nome>`. Depois de **qualquer** mudança aqui:

```sh
./sync.sh
```

O script copia `spaces-plus`, `space-menu` e `space-pin` para a pasta live e roda `herdr-app check` nos três. Não edite a pasta live diretamente.

## Ligação no layout

O layout pessoal `~/.config/herdr-app/layouts/werlang.json` aponta o bloco `spaces` para o clone:

```json
{
  "id": "spaces",
  "type": "block",
  "content": { "mod": "spaces-plus" }
}
```

O `spaces` original do Herdr continua intocado. Se o layout for resetado, reponha `spaces-plus`.

## Pin

O estado fica em `shared("spaces.pinned")`. Ao pinar, o mod cria uma aba `Pinned space` com o mod `space-pin`; ela é o que sobra quando os terminais/agents fecham. O `tabs-ref` ativo esconde essa aba enquanto o space tem outras abas; ela aparece só quando é a única. Ao despinar, essa aba é fechada. O item **Close** do menu continua fechando o space explicitamente.

## Skill

A skill `herdr-publish` está em `.agents/skills/herdr-publish/SKILL.md`. Ela cobre validação, sync, `RECIPE.md`/`preview.png` e publicação em `herdr.dev/mods` com o tópico `herdr-mod`.
