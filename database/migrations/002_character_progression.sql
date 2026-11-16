-- database/migrations/002_character_progression.sql
-- Adiciona progresso de torre, raça e evolução de classe.
alter table if exists characters
  add column if not exists race text default 'humano',
  add column if not exists class_evolution text,
  add column if not exists tower_floor integer default 1;

-- Índice auxiliar para consultas por andar (futuro leaderboard).
create index if not exists idx_characters_tower_floor on characters(tower_floor);
