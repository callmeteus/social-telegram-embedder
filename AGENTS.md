# AGENTS.md

## Sempre compilar e reinstalar a extensão ao finalizar

Após concluir qualquer alteração, recompile e reinstale a extensão no primeiro perfil do Chrome (Default) antes de considerar a tarefa terminada:

```
node scripts/build.mjs
powershell -ExecutionPolicy Bypass -File scripts/reload-chrome-extension.ps1
```

O build precisa terminar sem erros e o script precisa confirmar o reload da extensão no Chrome. Se qualquer etapa falhar, corrija o problema e execute novamente até passar.
