# Aetheria — próxima etapa técnica

## Alterações desta etapa

- `lib/gameEngine.js`: regras puras para dano, resolução de golpe, XP/níveis e probabilidade de drop.
- `lib/gameEngine.d.ts`: tipos TypeScript das regras.
- `tests/gameEngine.test.mjs`: testes automatizados com `node:test`.
- `app/page.tsx`: recompensas comuns agora são concedidas somente quando o HP do monstro chega a zero; drops são rolados uma vez por morte; XP excedente pode gerar vários níveis.

## Como validar

```bash
node --test tests/gameEngine.test.mjs
npm run lint
npm run build
```

## Limitação importante

Este é um passo de estabilização do protótipo, não uma implementação segura para produção. O combate e as recompensas ainda são iniciados no cliente. Antes de abrir o jogo publicamente ou permitir RMT, mover a resolução de combate e as alterações de inventário/moedas para operações confiáveis no servidor/banco, revisar autenticação e políticas RLS, e usar transações/idempotência para impedir duplicação de recompensas.

O ZIP original não continha schema/migrations do Supabase; portanto, nenhuma suposição foi feita sobre as tabelas existentes. Não execute alterações destrutivas no banco nesta etapa.
