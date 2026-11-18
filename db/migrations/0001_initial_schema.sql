-- Anonymous play activity, for the admin page.
--
-- Privacy: a device is a random UUID the app generates on first visit. There
-- are no accounts, names, emails, IP addresses or user agents. Colouring
-- itself (which pieces, which colours) stays on the device.

create table devices (
  id           uuid primary key,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint devices_seen_after_created check (last_seen_at >= created_at)
);

create index devices_last_seen_at_idx on devices (last_seen_at);

-- One row per device, day and mode, updated as the person plays.
create table plays (
  device_id       uuid        not null references devices (id) on delete cascade,
  -- The player's local calendar date, i.e. which daily mandala this was.
  play_date       date        not null,
  mode            text        not null,
  -- Generator version, so stats stay comparable if the patterns change.
  mandala_version smallint    not null,
  started_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  completed_at    timestamptz,
  -- Time spent actually interacting, capped at one day.
  active_seconds  integer     not null default 0,
  -- Share of the mandala coloured or drawn, 0..1.
  progress        real        not null default 0,
  -- Lines of symmetry last used (0 = off).
  symmetry_lines  smallint,

  primary key (device_id, play_date, mode),
  constraint plays_mode_valid check (mode in ('colour', 'draw')),
  constraint plays_version_positive check (mandala_version > 0),
  constraint plays_active_seconds_range check (active_seconds between 0 and 86400),
  constraint plays_progress_range check (progress between 0 and 1),
  constraint plays_symmetry_range check (symmetry_lines between 0 and 64),
  constraint plays_updated_after_started check (updated_at >= started_at),
  constraint plays_completed_after_started check (completed_at is null or completed_at >= started_at)
);

create index plays_play_date_idx on plays (play_date);

-- Per-day totals for the admin activity view.
create view daily_activity as
select
  play_date,
  count(distinct device_id)                                          as players,
  count(distinct device_id) filter (where completed_at is not null)  as finishers,
  count(*) filter (where mode = 'colour')                            as colour_plays,
  count(*) filter (where mode = 'draw')                              as draw_plays,
  coalesce(round(avg(active_seconds))::integer, 0)                   as avg_active_seconds,
  coalesce(round(avg(progress)::numeric, 3), 0)                      as avg_progress
from plays
group by play_date;

-- How often each lines-of-symmetry setting is used, per day.
create view symmetry_usage as
select play_date, symmetry_lines, count(*) as plays
from plays
where symmetry_lines is not null
group by play_date, symmetry_lines;
