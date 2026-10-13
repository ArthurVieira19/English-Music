-- Functional check for 20261013120000_song_scores.sql.
--
-- HOW TO RUN: paste this whole file into the Supabase SQL Editor and run it.
-- It ends with a deliberate error, "ROLLBACK_TEST_RESULT {...}", so Postgres
-- rolls everything back and nothing is left in your database. The JSON in the
-- error message is the report; each key says what was checked. Any value that
-- says "(BAD)" is a bug.
--
-- It acts as the oldest profile in the project (set via the JWT claims, which
-- is how PostgREST identifies a signed-in player), and uses a throwaway song
-- id so it cannot collide with real scores.

do $$
declare
  uid uuid;
  res jsonb := '{}'::jsonb;
  pid uuid;
  r record;
  lb jsonb;
  n integer;
begin
  select id into uid from public.profiles order by created_at limit 1;
  if uid is null then raise exception 'NO_PROFILE_TO_TEST_WITH'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);

  -- 1. Starting a play hands back a pass. Age it so the "too fast" check passes.
  pid := public.start_song_play('__rollback_test_song__');
  res := res || jsonb_build_object('1_start_returns_pass', pid is not null);
  update public.song_plays set started_at = now() - interval '10 minutes' where id = pid;

  -- 2. A valid first submission becomes the best score, in first place.
  select * into r from public.submit_song_score(pid, 'advanced', 'typing', 1500, 20, 18, 300000);
  res := res || jsonb_build_object('2_first_submit_expect_place1_new_best', to_jsonb(r));

  -- 3. The same pass cannot be spent twice.
  begin
    perform public.submit_song_score(pid, 'advanced', 'typing', 1500, 20, 18, 300000);
    res := res || jsonb_build_object('3_reuse_pass_expect_invalid_play', 'ACCEPTED (BAD)');
  exception when others then
    res := res || jsonb_build_object('3_reuse_pass_expect_invalid_play', sqlerrm);
  end;

  -- 4. A score above what the engine can pay (20 blanks x 250 = 5000).
  pid := public.start_song_play('__rollback_test_song__');
  update public.song_plays set started_at = now() - interval '10 minutes' where id = pid;
  begin
    perform public.submit_song_score(pid, 'advanced', 'typing', 5001, 20, 20, 300000);
    res := res || jsonb_build_object('4_score_over_ceiling_expect_implausible_score', 'ACCEPTED (BAD)');
  exception when others then
    res := res || jsonb_build_object('4_score_over_ceiling_expect_implausible_score', sqlerrm);
  end;

  -- 5. More correct answers than blanks.
  begin
    perform public.submit_song_score(pid, 'advanced', 'typing', 1000, 20, 21, 300000);
    res := res || jsonb_build_object('5_correct_over_blanks_expect_implausible_score', 'ACCEPTED (BAD)');
  exception when others then
    res := res || jsonb_build_object('5_correct_over_blanks_expect_implausible_score', sqlerrm);
  end;

  -- 6. A play time longer than the server's own clock (the pass is 10 min old).
  begin
    perform public.submit_song_score(pid, 'advanced', 'typing', 1000, 20, 18, 700000);
    res := res || jsonb_build_object('6_time_over_server_clock_expect_time_mismatch', 'ACCEPTED (BAD)');
  exception when others then
    res := res || jsonb_build_object('6_time_over_server_clock_expect_time_mismatch', sqlerrm);
  end;

  -- 7. An unknown difficulty.
  begin
    perform public.submit_song_score(pid, 'godlike', 'typing', 1000, 20, 18, 300000);
    res := res || jsonb_build_object('7_bad_difficulty_expect_invalid_mode', 'ACCEPTED (BAD)');
  exception when others then
    res := res || jsonb_build_object('7_bad_difficulty_expect_invalid_mode', sqlerrm);
  end;

  -- 8. A pass issued just now is far too young for 20 blanks.
  pid := public.start_song_play('__rollback_test_song__');
  begin
    perform public.submit_song_score(pid, 'advanced', 'typing', 1000, 20, 18, 1000);
    res := res || jsonb_build_object('8_pass_too_young_expect_too_fast', 'ACCEPTED (BAD)');
  exception when others then
    res := res || jsonb_build_object('8_pass_too_young_expect_too_fast', sqlerrm);
  end;

  -- 9. A lower score keeps the old best (1500) and is not a new best.
  update public.song_plays set started_at = now() - interval '10 minutes' where id = pid;
  select * into r from public.submit_song_score(pid, 'advanced', 'typing', 900, 20, 12, 300000);
  res := res || jsonb_build_object('9_lower_score_expect_best1500_not_new', to_jsonb(r));

  -- 10. A higher score replaces it.
  pid := public.start_song_play('__rollback_test_song__');
  update public.song_plays set started_at = now() - interval '10 minutes' where id = pid;
  select * into r from public.submit_song_score(pid, 'advanced', 'typing', 2200, 20, 20, 300000);
  res := res || jsonb_build_object('10_higher_score_expect_best2200_new', to_jsonb(r));

  select plays into n from public.song_scores
   where user_id = uid and song_id = '__rollback_test_song__' and difficulty = 'advanced' and mode = 'typing';
  res := res || jsonb_build_object('11_plays_counted_expect_3', n);

  -- 12. Boards are separate per mode: another mode has nothing on it.
  select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) into lb
    from public.get_song_leaderboard('__rollback_test_song__', 'advanced', 'multipleChoice', 10) l;
  res := res || jsonb_build_object('12_other_mode_board_expect_empty', lb);

  -- 13. The board for the mode that was played shows the single best score.
  select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) into lb
    from public.get_song_leaderboard('__rollback_test_song__', 'advanced', 'typing', 10) l;
  res := res || jsonb_build_object('13_board_expect_one_row_2200_is_me', lb);

  -- 14. A player who hid from the ranking still sees their own row.
  update public.profiles set hide_from_leaderboard = true where id = uid;
  select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) into lb
    from public.get_song_leaderboard('__rollback_test_song__', 'advanced', 'typing', 10) l;
  res := res || jsonb_build_object('14_hidden_player_sees_self_expect_1', jsonb_array_length(lb));

  -- 15. Signed-out callers are refused.
  begin
    set local role anon;
    perform public.start_song_play('__rollback_test_song__');
    reset role;
    res := res || jsonb_build_object('15_anon_start_expect_permission_denied', 'ALLOWED (BAD)');
  exception when others then
    reset role;
    res := res || jsonb_build_object('15_anon_start_expect_permission_denied', sqlerrm);
  end;

  -- 16. A signed-in player cannot write a score row directly, bypassing validation.
  begin
    set local role authenticated;
    insert into public.song_scores (user_id, song_id, difficulty, mode, best_score, best_accuracy, blanks, play_time_ms)
      values (uid, '__rollback_test_song__', 'beginner', 'typing', 999999, 100, 1, 1);
    reset role;
    res := res || jsonb_build_object('16_direct_insert_expect_rls_violation', 'ALLOWED (BAD)');
  exception when others then
    reset role;
    res := res || jsonb_build_object('16_direct_insert_expect_rls_violation', sqlerrm);
  end;

  -- 17. Nor read any play passes (the table has no policies at all).
  begin
    set local role authenticated;
    select count(*) into n from public.song_plays;
    reset role;
    res := res || jsonb_build_object('17_play_passes_visible_to_player_expect_0', n);
  exception when others then
    reset role;
    res := res || jsonb_build_object('17_play_passes_visible_to_player_expect_0', sqlerrm);
  end;

  -- Always abort, on purpose, so everything above is rolled back.
  raise exception 'ROLLBACK_TEST_RESULT %', res::text;
end
$$;
