# Análise de unificação — Aetheria (Next.js) x Aincrad (Godot/Summer)

Data: 19/10/2026
Escopo analisado:
- `C:\dev\aetheria-idle` — jogo web (Next.js 16 + React 19 + TypeScript + Supabase).
- `C:\Users\Dell\OneDrive\Documents\Projeto teste ia\new-game-project` — protótipo 3D (Summer Engine 0.7.3, base Godot 4.7, GDScript).
- `Aincrad_Guia.pdf` (16 páginas) e `docs/aincrad_guia_dev.html`.

---

## 1. Resumo executivo

Os dois projetos **não são concorrentes: são metades complementares do mesmo jogo**.

- O **Aetheria** tem a profundidade de sistemas: contas, personagens, raças, classes, evoluções, atributos, inventário, refino, mercado, RLS, persistência, torre infinita, party de 4, 30+ skills, recompensas offline e wiki.
- O **Aincrad** tem a apresentação: 3D isométrico real, modelos animados, toon shading, bloom, VFX, portal, câmera, números de dano flutuantes e loop de ondas/chefe.

O próprio guia do Aincrad lista como "próximos sistemas sugeridos" exatamente o que o Aetheria já construiu: tela de esquadrão, equipamentos/drops, raça/classe, recompensa offline e visual por andar. Isso confirma que a unificação natural é:

> **Aetheria = cérebro, conta e progressão. Aincrad = palco 3D da batalha.**

A recomendação principal é **não fundir código**, e sim integrar por contrato de dados:
1. O Aetheria continua sendo a fonte da verdade (Supabase).
2. O Aincrad vira o cliente 3D de combate.
3. O servidor resolve a batalha de forma determinística e envia um **replay** (lista de eventos); o cliente 3D apenas renderiza.
4. Conteúdo (classes, skills, andares, itens) é exportado do Aetheria para JSON e lido pelo Godot — uma única fonte de verdade.

---

## 2. O que o PDF do Aincrad descreve

- Engine: **Summer Engine 0.7.3**, "baseada em Godot 4.7"; GDScript; renderer GL Compatibility; D3D12 no Windows.
- Estado: **fatia jogável inicial** (Andar 1 + loop de andares).
- Cena principal: arena 60x60, plataforma circular, câmera fixa em `(0, 8.5, 13)` olhando para `(0, 1, -3)`, grade de 6 pilares, props, partículas de pétalas.
- Loop: `intro -> battle -> intermission -> portal` (ou `defeat`).
- Ondas por andar: 3. Onda 1 = 3 lobos; onda 2 = 2 lobos + 2 carneiros; onda 3 = chefe + 2 lobos.
- Escala: `1 + 0.45 * (andar - 1)` em HP e ATK. Recompensas x andar.
- Nível: XP começa em 60 e cresce x1.5; +12% HP/ATK por nível.
- Skills: **2** — Frost Nova (2.6x ATK, área 6 m, 8 s) e Healing Light (35% HP do squad, 14 s).
- Controles: 1/Q, 2/E, Tab (x1/x2/x3), Enter/Espaço (subir), R (retry).
- Assets: KayKit Adventurers (5 heróis), STN Monsters (14 monstros, incluindo chefe), VFX Magic, portal rift, look cel-anime, floresta estilizada, props Quaternius, pós-processamento bloom.
- **Não existe**: save/load, banco, login, inventário, equipamento, raça/classe, tela de esquadrão, recompensa offline, mercado. O guia reconhece isso como próximos passos.

### 2.1 Números do código Godot
- 2 scripts de gameplay: `main.gd` (361 linhas) e `unit.gd` (145 linhas).
- 1 cena principal (`main.tscn`, ~8,9 KB).
- 5 heróis, 14 monstros, 3 VFX principais + portal, 1 tema visual.
- Sem persistência: todo o estado morre ao fechar.

---

## 3. O que existe hoje no Aetheria

### 3.1 Stack e infraestrutura
- Next.js 16.4, React 19.3, TypeScript, Tailwind 4.
- Supabase (Postgres + Auth + RLS + Edge Function `resolve-battle`), região `sa-east-1`.
- Migrations: `000_consolidated`, `001_market_core`, `002_character_progression`, `003_sprint1_safety`, `004_talent_points`, `005_backfill_points`.
- Idempotência: `operation_keys` + RPC `apply_character_patch_idempotent`.
- Mercado RMT/ledger: `wallets`, `market_listings`, `economy_ledger`.
- Edge Function server-authoritative já esboçada (mas com fórmulas duplicadas e nomes de colunas divergentes — ver riscos).

### 3.2 Conteúdo e sistemas
- 9 raças com modificadores e bônus econômicos.
- 6 classes base + 8 evoluções de nível 40 (Arcmago, Bruxo, Paladino, Berserker, Atirador de Elite, Assassino, Sacerdote Divino, Inquisidor).
- 30+ skills com custo de MP, cooldown, poder e efeito.
- 13 tipos de item, 6 raridades, refino até +15, bolsa, depósito, equipar, vender, poções, joias, pets, asas.
- Torre infinita procedural (`getFloor`) com 6 famílias de bioma e 6 chefes rotativos.
- Temas visuais a cada 10 andares: Ruínas, Cristal, Lava, Celestial, Void.
- Marcos de dificuldade: elite (10), guardião (50), mega guardião (100).
- Party de 4 com posições `front/mid/back`, auto-cast por membro, classes finais nos bots, HP/MP individuais, morte individual e wipe.
- Skills de boss por tema, com gatilhos por HP e efeitos (AOE, stun, heal, buff, summon).
- Slots de skill (8), auto-cast do jogador, cooldowns, log de combate, auto-hunt.
- Wiki em `/wiki`, login em `/login`, seleção/criação de personagem.
- Módulos prontos mas **não integrados** ao loop principal: `idleRewards.ts`, `partyEngine.ts` e as funções de escala de `floorScaling.ts` (só `getTowerTheme` é usada).

### 3.3 Números
- `app/page.tsx`: ~111 KB, 2.099 linhas de código (o arquivo tem 4.198 linhas porque há uma linha em branco entre cada linha — artefato da recuperação via source map).
- 40+ módulos em `lib/`.
- Segundo o último levantamento: 1 conta, 3 personagens e ~808 itens no banco.

---

## 4. Comparativo por sistema

| Sistema | Aetheria (web) | Aincrad (Godot) | Observação |
|---|---|---|---|
| Render | CSS 2.5D + emojis + parallax | 3D real, toon, bloom, VFX | Aincrad vence |
| Animação | Nenhuma (cards/emoji) | 5 heróis + 14 monstros animados | Aincrad vence |
| Combate | Loop React `setInterval`, estado | `unit.gd` com IA, movimento, alcance, projétil | Aincrad tem “game feel”; Aetheria tem regras |
| Skills | 30+, MP, cooldown, efeitos | 2 skills | Aetheria vence |
| Boss | Skills por tema, gatilhos, AOE | 1 chefe, ataque + howl | Aetheria vence em regras |
| Party | 4 membros, posições, classes, auto-cast | 4 heróis fixos | Aetheria vence |
| Raças/classes | 9 raças, 6 classes + 8 evoluções | Não existe | Aetheria vence |
| Itens | 13 tipos, 6 raridades, refino, bolsa/depósito | Não existe | Aetheria vence |
| Economia | Ouro, premium, mercado, ledger | Ouro em memória | Aetheria vence |
| Progressão | Nível, XP, atributos, talentos, torre | Nível, XP, ouro | Aetheria vence em profundidade |
| Andares | Infinitos, temas, elites | 1 andar, escala linear | Aetheria vence |
| Idle/offline | Módulo de recompensas offline (não integrado) | Não existe | Aetheria vence |
| Persistência | Supabase + RLS + idempotência | Nenhuma | Aetheria vence |
| Autenticação | Supabase Auth | Nenhuma | Aetheria vence |
| UI/UX | Completa (HUD, modais, wiki) | HUD mínima (barras, labels) | Aetheria vence em cobertura; Aincrad em apresentação |
| Áudio | Não existe | Não existe | Empate (lacuna) |
| Multiplayer | Não existe | Não existe | Empate (lacuna) |
| Testes | 1 suíte (`gameEngine`) | Nenhum | Ambos precisam evoluir |

### 4.1 Diagnóstico
- **Aetheria é forte onde o Aincrad é raso**: regras, conteúdo, economia, banco.
- **Aincrad é forte onde o Aetheria é raso**: render, animação, feedback visual.
- **Nenhum dos dois é um MMO**: ambos são single-player idle. Guildas, raids e comércio entre jogadores são escopo futuro, não algo “já existente”.

---

## 5. Caminhos de unificação

### Opção A — Godot como cliente 3D + Aetheria como backend (recomendada)
O Aincrad deixa de ser um jogo separado e vira o “modo batalha 3D” do Aetheria.

**Fluxo**
1. Jogador faz login no Aetheria (web) e escolhe personagem/squad.
2. Clica em “Jogar em 3D”.
3. O site gera um token curto e abre o executável Godot (ou o embed web, se houver export).
4. O Godot busca o snapshot (`/state`) e inicia a batalha (`/battle/start`).
5. O servidor simula e devolve o replay + recompensas.
6. O Godot renderiza o replay; ao final, mostra loot/XP e volta ao hub.

**Prós**
- Aproveita o melhor dos dois sem reescrever nenhum.
- Aetheria continua sendo a fonte da verdade (banco, RLS, mercado).
- Anti-cheat real: recompensa calculada no servidor.
- O cliente 3D pode ser trocado no futuro sem tocar no backend.

**Contras**
- Duas aplicações para distribuir (web + executável).
- Precisa de camada de API/token e de um contrato de replay.
- Summer Engine pode dificultar export web (testar cedo).

**Esforço**: médio-alto. Melhor relação valor/risco se o alvo for desktop/Steam.

### Opção B — Godot exportado para Web, embutido no Next.js
O jogo 3D roda em WASM dentro de uma página `/play`, com o React por cima (login, bolsa, mercado).

**Prós**
- Uma única URL/deploy.
- Mantém a UI complexa em React e o 3D em Godot.
- Bridge via `JavaScriptBridge`/postMessage.

**Contras**
- Peso do build web (dezenas de MB) e consumo de memória.
- Performance em mobile e em máquinas modestas.
- Export web do Summer/Godot com shaders customizados pode falhar ou perder qualidade.
- Duas stacks de render na mesma página.

**Esforço**: médio, mas com risco técnico alto. Só vale se web for obrigatório e o export funcionar.

### Opção C — Reconstruir o 3D no navegador (React Three Fiber)
Portar o look do Aincrad para Three.js/R3F usando os mesmos GLBs (KayKit/Quaternius são CC0).

**Prós**
- Uma stack só (TypeScript), um deploy, sem engine externa.
- Reuso direto de todo o Aetheria (DB, UI, lógica).
- Funciona em web e mobile; mais fácil de evoluir com o time atual.

**Contras**
- Reimplementar animação, toon shading, bloom, VFX e câmera.
- Qualidade inicial abaixo do Godot; leva semanas para igualar.
- Performance de 4 heróis + 5 monstros + partículas em celular exige cuidado.

**Esforço**: alto no começo, mas menor custo de manutenção a longo prazo. Melhor se o alvo for web/mobile.

### Opção D — Manter dois jogos, compartilhar conteúdo
Exportar classes/skills/itens/andares do Aetheria para JSON e importar no Godot; sem integração de conta.

**Prós**
- Baixíssimo risco; útil como transição.
- Elimina duplicação de balanceamento.

**Contras**
- Continua sendo dois produtos; não resolve a visão de unificação.
- Sem progressão compartilhada.

**Esforço**: baixo. Recomendado como **fase 0** de qualquer opção.

### 5.1 Matriz de decisão

| Critério | A (Godot + API) | B (Godot Web) | C (R3F) | D (separados) |
|---|---|---|---|---|
| Qualidade visual | Alta | Alta (se exportar) | Média-Alta | Alta |
| Reuso do Aetheria | Alto | Alto | Total | Baixo |
| Esforço inicial | Médio-Alto | Médio | Alto | Baixo |
| Risco técnico | Médio | Alto | Médio | Baixo |
| Web/mobile | Não (desktop) | Sim | Sim | Não |
| Manutenção | 2 stacks | 2 stacks | 1 stack | 2 stacks |
| Anti-cheat | Forte | Forte | Forte | Fraco |

**Leitura**: se o objetivo é “jogo bonito de verdade, desktop/Steam”, escolha **A**. Se o objetivo é “tudo no navegador, uma conta, um link”, escolha **C** (ou **B**, se o export web do Summer funcionar). **D** é o primeiro passo de todas.

---

## 6. Arquitetura recomendada (Opção A)

```
+---------------------------+
|  Next.js (Vercel)         |
|  login, bolsa, mercado,   |
|  squad, status, wiki      |
+------------+--------------+
             | Supabase JWT / token curto
             v
+---------------------------+        +--------------------------+
|  Supabase                 |<------>|  Godot / Summer (3D)     |
|  Postgres + RLS           |  HTTP  |  arena, replay, HUD      |
|  Edge Functions           |        |  animações, VFX, portal  |
|  simulador determinístico |        +--------------------------+
+---------------------------+
```

### 6.1 Padrão “replay theater”
O servidor não devolve “você ganhou X”. Ele devolve **o que aconteceu**:

```ts
type BattleEvent =
  | { t: number; type: 'attack'; src: string; dst: string; damage: number; crit: boolean }
  | { t: number; type: 'skill'; src: string; skillId: string; dst?: string; damage?: number; heal?: number }
  | { t: number; type: 'boss_skill'; skillId: string; dst?: string; damage?: number }
  | { t: number; type: 'death'; unit: string }
  | { t: number; type: 'wave'; index: number }
  | { t: number; type: 'end'; outcome: 'victory' | 'defeat' };

type BattleResult = {
  battleId: string;
  seed: number;
  outcome: 'victory' | 'defeat';
  durationMs: number;
  rewards: { gold: number; exp: number; items: string[] };
  partyAfter: { id: string; hp: number; mp: number; alive: boolean }[];
  events: BattleEvent[];
};
```

Vantagens:
- O cliente 3D não calcula recompensa; só anima.
- O mesmo replay pode ser renderizado no web (fallback 2D) ou no Godot (3D).
- Fica trivial adicionar “pular batalha”, “x3”, “replay compartilhado”.
- Testes do simulador são puros e determinísticos (seed fixa).

### 6.2 Contratos de API (mínimo)
- `GET /api/game/state` — personagem, inventário, party, andar, cooldowns.
- `POST /api/game/party` — posições/classes/auto-cast (já existe `party_config`).
- `POST /api/battle/start` — valida andar, squad, skills; cria `battle_sessions`; devolve `battleId`, `seed`, snapshot.
- `POST /api/battle/finish` — recebe `battleId` + `idempotencyKey`, valida e grava recompensas; devolve recibo.
- `POST /api/game/offline-claim` — usa `calculateOfflineReward` no servidor.

Implementar como **Edge Functions** (Deno) ou route handlers do Next. Evitar lógica no cliente.

### 6.3 Autenticação no Godot
- **Desktop**: o site abre o jogo com um token curto assinado (`--token=...`) vinculado ao `character_id`; o jogo troca por sessão em `/api/game/session`. Nunca embutir `service_role`.
- **Login alternativo**: “código de dispositivo” (o jogo mostra um código, o site aprova).
- **Web export**: reaproveitar a sessão do navegador via postMessage/JavaScriptBridge.

### 6.4 Fonte única de conteúdo
Criar um script `npm run export:content` que gera `public/game-content.json` a partir de:
- `lib/content/classes.ts`
- `lib/content/classEvolutions.ts`
- `lib/content/skills.ts`
- `lib/content/races.ts`
- `lib/content/items.ts`
- `lib/content/monsters.ts`
- `lib/floorScaling.ts` (após consolidar a escala)

O Godot carrega esse JSON (ou uma cópia em `res://data/`) e usa para montar heróis, inimigos, skills e recompensas. Incluir um `contentVersion`/hash para detectar divergência.

### 6.5 Banco (aditivo, sem tocar no que existe)
```sql
create table if not exists battle_sessions (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references characters(id) on delete cascade,
  floor integer not null,
  mode text not null check (mode in ('farm','boss')),
  seed bigint not null,
  status text not null default 'started',
  result_json jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists idx_battle_sessions_char on battle_sessions(character_id, created_at desc);
```
O `result_json` guarda o replay + recompensas. `operation_keys` continua sendo a idempotência.

### 6.6 Determinismo
- Ticks fixos (ex.: 10/s), RNG com seed (`mulberry32` ou similar), matemática inteira.
- O cliente só interpola visualmente.
- Se o cliente calcular algo, o servidor re-simula e compara; divergência > tolerância = rejeita.
- Cuidado: TS e GDScript usam floats diferentes. Preferir inteiros e evitar depender de `pow`/arredondamento no cliente.

---

## 7. Roadmap sugerido

### Fase 0 — Estabilizar o Aetheria (2–4 dias)
- Remover a linha em branco entre cada linha de `app/page.tsx` (artefato de recuperação).
- Corrigir textos: `Depísito` -> `Depósito`, `Mercado RMP` -> `Mercado RMT`, `Voltar à  seleção` -> espaço duplo.
- Separar `page.tsx` em componentes/hooks (`useCombat`, `useParty`, `Arena`, `HUD`, `Modals`).
- Alinhar `exp` x `xp` e as colunas usadas pela Edge Function.
- Consolidar a escala de andares (hoje `monsters.ts` usa 1.22/1.30 e `floorScaling.ts` usa 1.18/1.22; só a primeira está em uso).
- Integrar ou remover `idleRewards`, `partyEngine` e as funções não usadas de `floorScaling`.

### Fase 1 — Núcleo compartilhado (1 semana)
- Extrair `lib/game-core` puro: stats, dano, skills, party, andares, recompensas.
- Criar `simulateBattle(snapshot, seed, config) -> BattleResult` com testes.
- Corrigir de passagem: cooldown global por `skillId` (deveria ser por membro) e MP lido de estado antigo no mesmo tick.
- Exportar `game-content.json`.

### Fase 2 — Ponte (3–5 dias)
- `GET /state`, `POST /party`, `POST /battle/start`, `POST /battle/finish`.
- `battle_sessions` + idempotência.
- Token de lançamento para o Godot.

### Fase 3 — Godot consumindo dados reais (1–2 semanas)
- Substituir `HEROES` hardcoded por snapshot da API.
- Mapear classe -> modelo/animção e raça -> escala/cor.
- Mapear skills -> VFX/animações (Frost Nova, Heal, Meteor, etc.).
- Formação `front/mid/back` e comportamento melee/ranged (já existe `ranged`).
- HUD com 8 slots, MP, cooldown, auto/manual.

### Fase 4 — Paridade de conteúdo (2–3 semanas)
- 5 temas visuais (Ruínas, Cristal, Lava, Celestial, Void) com luz/fog/partículas.
- 14 monstros do pacote STN distribuídos por bioma; chefes a cada 10 andares.
- Skills de boss do Aetheria -> telegrafia no Godot (cast bar, sigilo no chão, screen shake).
- Portal + transição de andar + câmera.
- Cidade do Andar 0 (alquimista, mercador, forja, terminal de mercado).

### Fase 5 — Persistência e polish (1–2 semanas)
- Save local (`user://session.json`) + refresh token.
- Recompensa offline ao abrir.
- Áudio (ambiente por tema, tema de chefe, SFX de hit/crit/heal).
- Export desktop (Steam/itch) e, se possível, web.

**Total realista**: 6–9 semanas em tempo integral; mais se for em paralelo com o trabalho atual.

---

## 8. Ideias de jogo para a versão unificada

1. **Replay theater**: o servidor manda o evento; o 3D anima. Permite x1/x2/x3, pular e compartilhar.
2. **Formação com significado**: front/mid/back; boss normal bate na front, AOE bate em todos; adicionar provocar/proteger.
3. **Telegrafia de boss**: barra de cast + sigilo no chão + som; skills de interrupção no lugar de esquiva manual.
4. **HUD de 8 slots**: cooldown radial, custo de MP, toggle auto/manual por membro, hotkeys 1–8.
5. **Temas por andar**: os 5 palettes do Aetheria viram 5 presets de ambiente no Godot (luz, fog, partículas: pétalas no celestial, brasas na lava, névoa no void).
6. **Bestiário**: usar os 14 monstros disponíveis; um chefe diferente a cada 10 andares (Brood Mother, Gloam Alpha, Hollow Man...), com escala/aura para elite/guardião/mega.
7. **Classe -> modelo**: guerreiro/paladino -> Knight; berserker -> Barbarian; arqueiro/assassino -> Rogue/Rogue Hooded; mago/arcmago/bruxo -> Mage; clérigo/sacerdote/inquisidor -> Mage recolorido (branco/dourado).
8. **Raça -> visual**: anão 0.85x, tauren 1.15x, troll 1.1x, goblin 0.9x, morto-vivo tint verde, pandaren 1.05x; usar `character_anim.recolor`.
9. **Equipamento visível**: arma/escudo/asas como props (`show_props`); pets como companheiros flutuantes.
10. **Cidade 3D (Andar 0)**: alquimista, mercador, forja e terminal de mercado; usar os props existentes (baú, barril, estandarte, candelabro).
11. **Relatório de ausência**: ao abrir, “Enquanto você esteve fora...” com XP/ouro/drops; coletar com animação de baú.
12. **Feedback de dano**: número flutuante (já existe), crítico dourado, cura verde, “MISS”, lifesteal, ícones elementais, shake no AOE.
13. **Morte e ressurreição**: estado caído, revive do clérigo, wipe -> volta ao farm (regra que o Aetheria já tem).
14. **Progressão híbrida**: atributos/talentos no web; no 3D só nível/XP e efeitos de level-up.
15. **Áudio**: loop orquestral por tema, tema de chefe, SFX; o PDF já sugere.
16. **Modificadores diários/semanais**: “andar 13: +dano de fogo”, definidos no servidor.
17. **Leaderboard**: andar mais alto, chefe mais rápido; cálculo no servidor.
18. **Foto/replay compartilhável**: gravar o replay e gerar um link/GIF; viral e barato.
19. **Pets e asas**: já existem como tipos de item; no 3D viram props/companheiros.
20. **Fallback web**: se o Godot não rodar, o mesmo replay é renderizado em 2D no navegador.

---

## 9. Riscos e armadilhas

1. **Lock-in do Summer Engine**: o guia diz que abrir no Godot oficial “não foi testado”. Testar export/abertura no Godot 4.x antes de apostar tudo.
2. **Export web**: se o Summer não exportar para Web, a Opção B morre; a Opção A continua.
3. **`exp` x `xp`**: a Edge Function usa `xp`/`hp_current`/`attack`, mas o cliente usa `exp` e stats derivados. Alinhar antes de qualquer API.
4. **Fórmulas duplicadas**: `resolve-battle` reimplementa `calculatePlayerDamage`, `applyExperience` etc. Mover para um núcleo compartilhado e importar (ou gerar bundle) — nunca “manter em sincronia à mão”.
5. **Cooldown global**: hoje `skillCooldowns[skillId]` é compartilhado entre todos os membros; dois bots com a mesma skill bloqueiam um ao outro. Corrigir no núcleo puro.
6. **MP defasado no tick**: o loop lê `m.mp` do estado antigo e dispara vários `setPartyMembers` no mesmo tick; pode gastar mais MP do que deveria.
7. **Monólito**: `page.tsx` com 2.099 linhas de código é o maior risco de manutenção. Separar antes de adicionar o cliente 3D.
8. **Segurança**: nunca embutir `service_role` no executável; usar JWT do usuário + RLS; validar posse do personagem.
9. **Determinismo**: floats entre TS e GDScript divergem; usar inteiros/seed e validação no servidor.
10. **Performance**: 4 heróis + 5 monstros + VFX + partículas em mobile; testar em hardware modesto.
11. **Licenças**: KayKit e Quaternius são CC0; conferir os PACK.json de natureza/VFX antes de distribuir.
12. **Escopo “MMORPG”**: nenhum dos dois tem multiplayer. Não prometer guildas/raids/comércio entre jogadores sem um plano à parte.
13. **HUD atual**: a captura mostra símbolos quebrados e textos como “Mercado RMP”; o fonte atual não tem U+FFFD, mas o build servido pode estar velho. Limpar cache e corrigir os typos.

---

## 10. Quick wins (esta semana)

- [ ] Remover a linha em branco entre cada linha de `app/page.tsx` (volta a ~2.099 linhas).
- [ ] Corrigir `Depísito`, `Mercado RMP`, `Voltar à  seleção`.
- [ ] Alinhar `exp`/`xp` e a Edge Function.
- [ ] Consolidar a escala de andares em uma única função.
- [ ] Integrar `calculateOfflineReward` ao carregar o personagem.
- [ ] Corrigir cooldown por membro (não por skill).
- [ ] Criar `npm run export:content` e gerar o primeiro JSON.
- [ ] PoC de 2–3 dias: Godot lê um snapshot JSON do personagem nível 69, andar 13, squad real; roda 1 batalha; exporta o resultado. Sem login/DB ainda.

---

## 11. Decisão necessária

Para escolher entre A, B e C, preciso de três respostas:

1. **Plataforma principal**: desktop/Steam, navegador ou mobile?
2. **Prioridade**: qualidade visual máxima (Godot) ou um único deploy web (R3F)?
3. **Aposta**: podemos testar o export web do Summer Engine nesta semana? Se sim, B fica viável; se não, A ou C.

Recomendação padrão, se não houver preferência: **A + fallback web 2D**, com **D (JSON compartilhado)** como fase 0. Isso preserva o que já funciona, entrega o 3D que você gostou e não fecha portas.
