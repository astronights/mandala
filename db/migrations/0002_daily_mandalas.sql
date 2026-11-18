-- What each day's mandala was: the inputs that reproduce it exactly, plus a
-- summary of the pattern for analysis. Geometry is never stored; it is
-- regenerated from (date, seed, version).

create table daily_mandalas (
  play_date        date        primary key,
  mandala_version  smallint    not null,
  seed             text        not null,

  -- Summary of the generated pattern.
  symmetry         smallint    not null,
  ring_count       smallint    not null,
  motifs           text[]      not null,
  piece_count      integer     not null,
  group_count      integer     not null,
  palette_scheme   text        not null,
  palette          text[]      not null,

  -- Reserved for admin curation: replace a day's pattern with another seed.
  -- Not read by the app yet.
  override_seed    text,
  override_note    text,

  recorded_at      timestamptz not null default now(),

  constraint daily_mandalas_version_positive check (mandala_version > 0),
  constraint daily_mandalas_seed_length check (char_length(seed) between 1 and 64),
  constraint daily_mandalas_override_seed_length
    check (override_seed is null or char_length(override_seed) between 1 and 64),
  constraint daily_mandalas_override_note_length
    check (override_note is null or char_length(override_note) <= 500),
  constraint daily_mandalas_symmetry_range check (symmetry between 3 and 64),
  constraint daily_mandalas_ring_count_range check (ring_count between 1 and 32),
  constraint daily_mandalas_motifs_match_rings check (cardinality(motifs) = ring_count),
  constraint daily_mandalas_piece_count_positive check (piece_count > 0),
  constraint daily_mandalas_group_count_positive check (group_count > 0),
  constraint daily_mandalas_palette_size check (cardinality(palette) between 1 and 16)
);

-- Admin failed-login log, for the passcode lockout. Holds timestamps only.
create table admin_login_failures (
  id        bigint generated always as identity primary key,
  failed_at timestamptz not null default now()
);

create index admin_login_failures_failed_at_idx on admin_login_failures (failed_at);

-- One row per day: the pattern alongside how people engaged with it.
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
  coalesce(a.avg_progress, 0)                 as avg_progress
from daily_mandalas m
full outer join daily_activity a on a.play_date = m.play_date;
