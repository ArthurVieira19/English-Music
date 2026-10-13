-- SongGap per-song ranking.
--
-- HOW TO APPLY: open the SQL Editor of the Supabase project this app uses
-- (the one in NEXT_PUBLIC_SUPABASE_URL), paste this whole file and run it.
-- It is additive and safe to run more than once. Until it has run, the app
-- keeps working exactly as before: scores just aren't ranked per song.
--
-- Why this exists: the XP leaderboard (20261001120000_leaderboard.sql) rewards
-- volume, so replaying one song forever climbs it. This ranks the BEST score a
-- player has on each (song, difficulty, mode), which cannot be farmed, and the
-- server — not the browser — decides whether a submitted score is plausible.
--
-- How a score gets in:
--   1. When a game starts the browser calls start_song_play(song). The server
--      records the start time on ITS clock and hands back a one-use "play pass".
--   2. When the song ends the browser calls submit_song_score(pass, ...).
--      The server checks the pass is the caller's, unused, and old enough for
--      that many blanks to have actually been answered; that the score is no
--      higher than the engine can pay; and that the reported play time doesn't
--      outrun the server's own clock. Only then is the score considered.
--
-- This stops anyone posting a score straight to the API, but the browser still
-- reports what the player typed, so a determined cheater who really plays the
-- song's full duration is not caught. It is a friendly ranking, not a
-- tamper-proof one — the same trade-off as the XP leaderboard.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists hide_from_leaderboard boolean not null default false;

-- One row per game started. Only the functions below ever touch it.
create table if not exists public.song_plays (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  song_id    text not null,
  started_at timestamptz not null default now(),
  used       boolean not null default false
);

create index if not exists song_plays_user_started_idx
  on public.song_plays (user_id, started_at);

alter table public.song_plays enable row level security;

-- A player's best result per song, difficulty and answer mode (typing and
-- multiple choice are separate boards: they are not equally hard).
create table if not exists public.song_scores (
  user_id       uuid not null references auth.users (id) on delete cascade,
  song_id       text not null,
  difficulty    text not null check (difficulty in ('beginner', 'intermediate', 'advanced', 'expert')),
  mode          text not null check (mode in ('typing', 'multipleChoice', 'fullPhrase')),
  best_score    integer not null check (best_score >= 0),
  best_accuracy numeric(5, 2) not null check (best_accuracy between 0 and 100),
  blanks        integer not null check (blanks > 0),
  play_time_ms  integer not null check (play_time_ms >= 0),
  plays         integer not null default 1,
  achieved_at   timestamptz not null default now(),
  primary key (user_id, song_id, difficulty, mode)
);

create index if not exists song_scores_board_idx
  on public.song_scores (song_id, difficulty, mode, best_score desc, achieved_at);

alter table public.song_scores enable row level security;

-- Players may read their own rows; nobody can write directly. Every write goes
-- through submit_song_score, which is the only place scores are validated.
drop policy if exists "song_scores read own" on public.song_scores;
create policy "song_scores read own"
  on public.song_scores for select
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Starting a game
-- ---------------------------------------------------------------------------

create or replace function public.start_song_play(p_song_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_song_id is null or length(p_song_id) = 0 or length(p_song_id) > 200 then
    raise exception 'invalid_song' using errcode = '22023';
  end if;

  -- Housekeeping: drop day-old passes, and keep at most 19 unused ones so
  -- abandoned games can't grow the table without bound.
  delete from public.song_plays
   where user_id = auth.uid()
     and started_at < now() - interval '1 day';

  delete from public.song_plays
   where user_id = auth.uid()
     and not used
     and id not in (
       select id from public.song_plays
        where user_id = auth.uid() and not used
        order by started_at desc
        limit 19
     );

  insert into public.song_plays (user_id, song_id)
  values (auth.uid(), p_song_id)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.start_song_play(text) from public, anon;
grant execute on function public.start_song_play(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Submitting a score
-- ---------------------------------------------------------------------------
-- Output columns are prefixed `out_` so they can't clash with the table
-- columns of the same name inside the function body.
--
-- 250 = the most one blank can pay (100 base + 50 speed + 100 for the combo
-- ceiling). Keep it in sync with MAX_POINTS_PER_BLANK in
-- src/modules/game/scoreEngine.ts.

create or replace function public.submit_song_score(
  p_play_id      uuid,
  p_difficulty   text,
  p_mode         text,
  p_score        integer,
  p_blanks       integer,
  p_correct      integer,
  p_play_time_ms integer
)
returns table (
  out_place       bigint,
  out_best_score  integer,
  out_is_new_best boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_play       public.song_plays%rowtype;
  v_prev       public.song_scores%rowtype;
  v_elapsed_ms numeric;
  v_best       integer;
  v_at         timestamptz;
  v_new_best   boolean;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_difficulty not in ('beginner', 'intermediate', 'advanced', 'expert')
     or p_mode not in ('typing', 'multipleChoice', 'fullPhrase') then
    raise exception 'invalid_mode' using errcode = '22023';
  end if;

  if p_blanks is null or p_blanks < 1 or p_blanks > 2000
     or p_correct is null or p_correct < 0 or p_correct > p_blanks
     or p_score is null or p_score < 0 or p_score > p_blanks * 250
     or p_play_time_ms is null or p_play_time_ms < 0 then
    raise exception 'implausible_score' using errcode = '22023';
  end if;

  -- Lock the pass so two concurrent submissions can't both spend it.
  select * into v_play
    from public.song_plays
   where id = p_play_id and user_id = auth.uid() and not used
     for update;
  if not found then
    raise exception 'invalid_play' using errcode = '22023';
  end if;

  v_elapsed_ms := extract(epoch from (now() - v_play.started_at)) * 1000;

  -- Nobody answers a blank in under 0.8s on average while the song plays.
  if v_elapsed_ms < p_blanks * 800 then
    raise exception 'too_fast' using errcode = '22023';
  end if;
  -- The browser's own stopwatch can't have run longer than the server's
  -- (5s of slack for the request in flight).
  if p_play_time_ms > v_elapsed_ms + 5000 then
    raise exception 'time_mismatch' using errcode = '22023';
  end if;

  update public.song_plays set used = true where id = p_play_id;

  select * into v_prev
    from public.song_scores
   where user_id = auth.uid()
     and song_id = v_play.song_id
     and difficulty = p_difficulty
     and mode = p_mode
     for update;

  if not found then
    insert into public.song_scores
      (user_id, song_id, difficulty, mode, best_score, best_accuracy, blanks, play_time_ms)
    values
      (auth.uid(), v_play.song_id, p_difficulty, p_mode, p_score,
       round(p_correct::numeric * 100 / p_blanks, 2), p_blanks, p_play_time_ms);
    v_best := p_score;
    v_at := now();
    v_new_best := true;
  elsif p_score > v_prev.best_score then
    update public.song_scores
       set best_score    = p_score,
           best_accuracy = round(p_correct::numeric * 100 / p_blanks, 2),
           blanks        = p_blanks,
           play_time_ms  = p_play_time_ms,
           plays         = v_prev.plays + 1,
           achieved_at   = now()
     where user_id = auth.uid()
       and song_id = v_play.song_id
       and difficulty = p_difficulty
       and mode = p_mode;
    v_best := p_score;
    v_at := now();
    v_new_best := true;
  else
    update public.song_scores
       set plays = v_prev.plays + 1
     where user_id = auth.uid()
       and song_id = v_play.song_id
       and difficulty = p_difficulty
       and mode = p_mode;
    v_best := v_prev.best_score;
    v_at := v_prev.achieved_at;
    v_new_best := false;
  end if;

  -- Place among visible players: higher score first, and on a tie whoever got
  -- there first keeps the better place.
  return query
  select
    (select count(*) + 1
       from public.song_scores s
       join public.profiles pr on pr.id = s.user_id
      where s.song_id = v_play.song_id
        and s.difficulty = p_difficulty
        and s.mode = p_mode
        and s.user_id <> auth.uid()
        and not pr.hide_from_leaderboard
        and (s.best_score > v_best
             or (s.best_score = v_best and s.achieved_at < v_at))),
    v_best,
    v_new_best;
end;
$$;

revoke all on function public.submit_song_score(uuid, text, text, integer, integer, integer, integer) from public, anon;
grant execute on function public.submit_song_score(uuid, text, text, integer, integer, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Reading a song's ranking
-- ---------------------------------------------------------------------------
-- Top p_limit (max 50) plus the caller's own row wherever it is. Exposes only
-- display name, level and the score — never email — and skips players who
-- opted out (a player who opted out still sees themselves).

create or replace function public.get_song_leaderboard(
  p_song_id    text,
  p_difficulty text,
  p_mode       text,
  p_limit      integer default 10
)
returns table (
  place        bigint,
  user_id      uuid,
  display_name text,
  level        integer,
  score        integer,
  accuracy     numeric,
  is_me        boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with scored as (
    select
      s.user_id,
      coalesce(nullif(trim(p.display_name), ''), 'Player') as display_name,
      coalesce(ud.level, 1)::integer as level,
      s.best_score as score,
      s.best_accuracy as accuracy,
      s.achieved_at
    from public.song_scores s
    join public.profiles p on p.id = s.user_id
    left join public.user_data ud on ud.user_id = s.user_id
    where s.song_id = p_song_id
      and s.difficulty = p_difficulty
      and s.mode = p_mode
      and (not p.hide_from_leaderboard or s.user_id = auth.uid())
  ),
  ranked as (
    select row_number() over (order by score desc, achieved_at asc, user_id) as place, *
    from scored
  )
  select place, user_id, display_name, level, score, accuracy, (user_id = auth.uid()) as is_me
  from ranked
  where place <= greatest(1, least(coalesce(p_limit, 10), 50))
     or user_id = auth.uid()
  order by place
$$;

revoke all on function public.get_song_leaderboard(text, text, text, integer) from public, anon;
grant execute on function public.get_song_leaderboard(text, text, text, integer) to authenticated;
