-- Keep the complete generated mandala for every day it goes live: every
-- shape, placement and colour exactly as players saw it (about 12 KB a day).
-- Rows are only written for days that are live somewhere, never in advance.
alter table daily_mandalas add column mandala jsonb;

-- Mandala numbers, like Wordle's: 19 November 2026 is #1.
alter table daily_mandalas
  add column day_number integer generated always as (play_date - date '2026-11-19' + 1) stored;
