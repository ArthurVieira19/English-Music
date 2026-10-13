-- SongGap: rank the word-bank answer mode.
--
-- HOW TO APPLY: open the SQL Editor of the Supabase project this app uses,
-- paste this whole file and run it, AFTER 20261013120000_song_scores.sql.
-- It is safe to run more than once. Until it has run, word-bank games are
-- played normally but their scores are not ranked (the server refuses the
-- unknown mode and the ranking card stays hidden).
--
-- The only change from 20261013120000_song_scores.sql is that 'wordBank' joins
-- the list of answer modes, in the table check and in submit_song_score's
-- validation. Word bank gets its own boards: picking from upcoming words is
-- not as hard as typing, nor the same as four fixed options.

alter table public.song_scores drop constraint if exists song_scores_mode_check;
alter table public.song_scores
  add constraint song_scores_mode_check
  check (mode in ('typing', 'multipleChoice', 'fullPhrase', 'wordBank'));

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
     or p_mode not in ('typing', 'multipleChoice', 'fullPhrase', 'wordBank') then
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
