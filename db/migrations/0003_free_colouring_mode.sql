-- Colouring now has two modes: guided ('colour', the day's designed colours)
-- and free ('free', any of the day's colours anywhere).

alter table plays drop constraint plays_mode_valid;
alter table plays add constraint plays_mode_valid check (mode in ('colour', 'free', 'draw'));

-- Views gain a free_plays column; dependants are rebuilt in order.
drop view daily_overview;
drop view daily_activity;

create view daily_activity as
select
  play_date,
  count(distinct device_id)                                          as players,
  count(distinct device_id) filter (where completed_at is not null)  as finishers,
  count(*) filter (where mode = 'colour')                            as colour_plays,
  count(*) filter (where mode = 'draw')                              as draw_plays,
  coalesce(round(avg(active_seconds))::integer, 0)                   as avg_active_seconds,
  coalesce(round(avg(progress)::numeric, 3), 0)                      as avg_progress,
  count(*) filter (where mode = 'free')                              as free_plays
from plays
group by play_date;

create view daily_overview as
select
  coalesce(m.play_date, a.play_date)          as play_date,
  m.mandala_version,
  m.seed,
  m.symmetry,
  m.ring_count,
  m.piece_count,
  m.palette_scheme,
  coalesce(a.players, 0)                      as players,
  coalesce(a.finishers, 0)                    as finishers,
  coalesce(a.colour_plays, 0)                 as colour_plays,
  coalesce(a.draw_plays, 0)                   as draw_plays,
  coalesce(a.avg_active_seconds, 0)           as avg_active_seconds,
  coalesce(a.avg_progress, 0)                 as avg_progress,
  coalesce(a.free_plays, 0)                   as free_plays
from daily_mandalas m
full outer join daily_activity a on a.play_date = m.play_date;
