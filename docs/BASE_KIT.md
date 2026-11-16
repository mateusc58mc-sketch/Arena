# Aetheria — Base Kit (Conteúdo Primeiro, RMT Depois)

Este base kit organiza o projeto para crescer sem reescrever. O mercado RMT fica
por último, mas **já existe terreno** (interfaces, contratos e tabelas sugeridas).

## Estrutura

```
lib/
  types/core.ts          # tipos compartilhados (Character, Item, etc.)
  content/
    races.ts             # raças + modificadores + economia
    classes.ts           # classes + crescimento + skills
    skills.ts            # habilidades
    items.ts             # catálogo de itens (fonte canônica)
    monsters.ts          # andares e monstros
  systems/
    stats.ts             # stats derivados + dano
    idle.ts               # progresso offline
  economy/
    market.ts            # contratos RMT futuro (listing, fee, escrow)
  persistence/
    types.ts             # interface GameRepository + adapter em memória
    supabaseRepository.ts# adapter Supabase (hoje)
  gameDatabase.ts        # camada de compatibilidade (ITEM_DATABASE, TOWER_FLOORS_DB)
  gameEngine.js          # regras puras testáveis
  gameEngine.d.ts
```

## Como expandir conteúdo

1. Adicione itens em `lib/content/items.ts` (com raridade, stats, `premium`).
2. Adicione classes/raças/skills nos respectivos arquivos.
3. Adicione andares em `lib/content/monsters.ts`.
4. Use `computeDerivedStats()` (em `lib/systems/stats.ts`) para recalcular
   ATK/DEF/HP/etc. a partir de personagem + inventário + raça.

## Terreno para RMT futuro

- `lib/economy/market.ts`: listing, fee, validação.
- `lib/persistence/types.ts`: interface de repositório; quando migrar para
  backend autoritativo, basta trocar o adapter.

## Progresso da torre (salvo)

- Andar atual e maior andar desbloqueado são salvos em `localStorage`
  (chave `aetheria_floor_<character_id>`) e tentativa de `tower_floor`
  no Supabase. Assim ao reabrir o jogo a caça retoma no andar salvo.
- Se a coluna `tower_floor` não existir no banco, o `localStorage` mantém
  o progresso local (terreno para o backend futuro).
- Item tem flag `premium` para definir o que pode circular no mercado.
- `Character` tem `premium_currency` reservado (cash/gemas).

## Migrações SQL sugeridas (futuro)

Veja `database/migrations/` para esqueletos de tabelas de mercado/ledger.
Antes de ativar RMT: mover combate para Edge Functions/RPC, RLS forte,
transações e idempotência.

## Próximos passos recomendados (conteúdo)

- [ ] Aplicar raça/classe no personagem (colunas + bônus reais).
- [ ] Refino/forja de itens (consumo de Pedra de Refino).
- [ ] Skills reais no combate (cooldown, MP).
- [ ] Mais andares (6+).
- [ ] Missões diárias / conquistas.
- [ ] Leaderboard da torre.

## Validação

```
node --test tests/gameEngine.test.mjs
npm run lint
npm run build
```
