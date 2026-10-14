# Project: SongGap

## Vision

Create a modern web application based on the well-known "fill in the missing lyrics" listening game format, but with a completely original user experience, visual identity, architecture, and codebase.

The focus is on learning English through listening comprehension using music videos from YouTube.

Accounts and storage (changed 2026-09-30 — this replaces the original "no accounts, no backend" rule):

- Login is required to play. Accounts use Supabase Auth (email + password, email confirmation off).
- Each player's progress is saved to Supabase (`user_data`), so a leaderboard can be built on it later.
- The song library is global (`songs` table): every player reads it, only admins (`profiles.is_admin`) can add, edit or remove songs. This is enforced by row level security, not just by hiding buttons.
- There is still no custom backend API: the browser talks to Supabase directly.

The application should feel like a mix of:

- Spotify
- Duolingo
- Modern SaaS product

Clean animations, glassmorphism, smooth transitions and game-like feedback.

---

# Core Gameplay

User selects a song.

The YouTube video starts playing.

Lyrics are displayed in sync with the video.

Some words are hidden.

The user must either:

- Type the missing word
- Select the correct option
- Complete entire phrases

The objective is to train listening comprehension.

---

# Tech Stack

Mandatory:

- Next.js 15
- TypeScript
- TailwindCSS
- shadcn/ui
- Framer Motion
- Zustand

- Supabase (`@supabase/supabase-js`, `@supabase/ssr`) for auth and Postgres

No custom backend API: everything runs in the browser. The site is a static export (`output: "export"`) hosted on GitHub Pages (`.github/workflows/pages.yml`, base path `/lingoclip2.0` via `NEXT_PUBLIC_BASE_PATH`), so there is no middleware: `AuthGate` gates pages behind login on the client. The game route is `/game?id=<songId>` because song ids come from the database and cannot be pre-rendered.

---

# Storage

Supabase is the source of truth; LocalStorage is a synchronous cache in front of it, so the stores stay sync.

- `src/services/storage/` — `storageService` reads/writes the LocalStorage cache and queues a debounced upsert after every save.
- `src/services/supabase/` — browser client and `userDataSync` (pull on login, debounced push, reset, sign-out flush).
- `src/services/songs/songRepository.ts` — the global song library.
- `src/services/auth/authService.ts` — login, sign-up, sign-out.

Synced per player (one `user_data` row): settings, statistics, completed songs, XP, streak, achievements, weak words. `xp`/`level` are also stored as plain columns for a future leaderboard.

Sync rules worth knowing: the cache records which account owns it (`songgap:v1:owner`) and whether it has unsynced changes (`songgap:v1:dirty`). If the database can't be reached on login the app blocks instead of continuing with an empty cache, since the next save would overwrite the real progress. Songs saved in the browser before accounts existed are imported into the global library the first time an admin logs in.

Schema and RLS live in the Supabase project (`profiles`, `songs`, `user_data`); env vars `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` go in `.env.local` (git-ignored). Never put the service_role key in the app.

---

# Song Data Model

Each song contains:

```ts
interface Song {
  id: string
  title: string
  artist: string
  youtubeId: string
  thumbnail: string
  difficulty: string
  lyrics: LyricLine[]
}




interface LyricLine {
  start: number
  end: number
  text: string
}
```

---

# Learning Effectiveness

Goal: improve how much English people actually retain, not just app polish. Brainstormed 2026-09-27; the first three shipped 2026-09-29.

## Shipped

- **Spaced-repetition review mode.** Missed words go into a cross-song "weak words" pool (`reviewStore`, synced to the player's account), each carrying the lyric line it was missed in. The `/review` screen resurfaces the due ones as fill-in-the-blank cards with no video needed. Interval ladder lives in `modules/review/spacedRepetition.ts` (1/3/7/16/35 days); a word only earns interval credit once its delay has actually elapsed, so a repeated chorus can't "master" a word in one playthrough.
- **Tap-to-define a revealed word.** Any visible lyric word opens a definition popover (`word-definition-popover.tsx`) backed by the keyless dictionaryapi.dev, cached in memory.
- **Slow-down control.** Speed picker (0.5x–1.5x) in the game transport bar, wired to `YouTubePlayer.setPlaybackRate`.
- **Review counts toward the daily streak.** Streaks come from `progress.activityDays` (songs *and* reviews). `ReviewSession` calls `statsStore.recordActivityDay()` on the first answer, so abandoning a deck midway still keeps the day.
- **Pedagogical feedback on wrong answers** (shipped 2026-10-01). `modules/game/mistakeAnalyzer.ts` classifies a wrong guess — homophone, contraction, spoken reduction (gonna/wanna), dropped ending (-s/-ed/-ing), vowel confusion (ship/sheep), spelling slip, near miss — pure and offline. In-game, `mistake-note.tsx` shows a non-spoiling *nudge* while a try remains and the full explanation once the blank is resolved; in `/review` a wrong answer with an explanation waits for "Continue" instead of auto-advancing.
- **Replay line + keyboard shortcuts** (2026-10-01). `controller.replayLine()` re-hears the current line (or does the pending retry). Shortcuts live in `modules/game/gameShortcuts.ts`: `Alt+R` replay, `Alt+P` play/pause, `Alt+B` back 5s, `Alt+S` skip, and the same bare keys (+ Space) only when focus isn't on an input/button, so typing never triggers them.
- **Leaderboard** (2026-10-01). `/leaderboard` (weekly + all-time) reads the `get_leaderboard` RPC; weekly XP is computed by a DB trigger from increases of `user_data.xp` (the client never writes it). Players can hide themselves in Settings > Privacy (`profiles.hide_from_leaderboard`, via the `set_leaderboard_hidden` RPC). **Needs `supabase/migrations/20261001120000_leaderboard.sql` run once in the app's Supabase SQL editor** — until then the page shows "not set up". Scores are client-reported like the rest of the progress, so this is a friendly ranking, not a tamper-proof one.
- **Accessibility/mobile pass** (2026-10-01). Solid global `:focus-visible` ring, screen-reader announcements for each answer, `scroll-mb` on blanks so a tap clears the fixed transport bar, transport row trimmed on narrow phones (the 10s rewind hides below `sm`), 5-tab mobile bar.

- **Engine pass: fairer scoring, stars, no repeated blanks, per-song ranking** (2026-10-13).
  - The combo bonus now stops growing after `COMBO_STREAK_CAP` (10) answers in a row; before, it grew linearly forever, so a flawless long song scored quadratically more than a short one. XP still equals the score, so long songs now pay less XP than they used to.
  - `calculateStars` (in `scoreEngine.ts`) rates a run 0-5 in half-star steps against the song's own "par" (a flawless run at average pace), so songs are comparable. Shown on Results; `GameResult` gained optional `mode`, `blanks`, `stars`.
  - **Redoing a line no longer double-counts.** `gameStore.unanswerToken` used to reset a blank without taking its points back, so jumping back to a line and re-answering stacked score (and pushed accuracy past 100%). The store now keeps `tokenPoints` per blank and refunds them.
  - `generateSongExercises` builds all lines of a song together and steers each line away from words already hidden earlier (a repeated chorus no longer hides the same word every time). It only reorders choices *within* a priority tier and never changes how many words are hidden.
  - **Per-song ranking** (Results page, `SongRankingCard`): best score per (song, difficulty, answer mode), tie broken by who got there first. Unlike the XP leaderboard it can't be farmed by replaying. The server issues a one-use "play pass" when a game starts (`start_song_play`) and validates the score on `submit_song_score`: pass is the caller's and unused, enough real time has passed for that many blanks, score is within the engine's ceiling, reported play time doesn't outrun the server clock. It stops forged API posts, not a cheater who really plays the song out, so it is still a friendly ranking. **Needs `supabase/migrations/20261013120000_song_scores.sql` run once in the app's Supabase SQL editor**; until then scores are simply not ranked and the card stays hidden. The migration's `250` per-blank ceiling must match `MAX_POINTS_PER_BLANK` in `scoreEngine.ts`.

- **Per-song lyric sync offset** (2026-10-13). A YouTube upload often has a different intro than the recording the lyrics were timed against, so every line lands seconds early or late. `OffsetMediaPlayer` wraps the player so the whole game lives in *lyric time* (`lyric = video - offset`): the synchronizer, replay, retry, rewind and seeks need no changes, and the offset can change mid-song without resetting anything. The correction is saved per player and per song in `settings.songOffsets` (so it syncs with the account and needs **no migration**). UI: `SyncControl` under the video: nudge buttons, plus a one-tap calibration (tap when the highlighted line is sung; `offsetFromTap` subtracts a 0.25s reaction delay). Changing the offset is not treated as a missed line (`OFFSET_SETTLE_MS`). It is per player: a fix isn't shared, because the library has no offset column.

- **Gameplay pass: stop at line end, blanks by time, empty-blank keys, ten levels, word bank** (2026-10-13).
  - **Stops at the end of the line.** `modules/game/lineEndGuard.ts`: while the active line has open blanks, the controller's frame loop eases the volume out over the last 0.3s and pauses 0.1s before the line ends, so the next line never bleeds in. Volume comes back on `play()` and on any PLAYING state change (YouTube's own controls). The synchronizer's "missed a line" pause is still there as the safety net.
  - **Blanks are paced by time, not a share of each line.** `allocateBlanksByTime` (difficultyEngine) banks each line's duration and spends one blank per `secondsPerBlank(level)` seconds, carrying at most 2 blanks' worth (so an instrumental break can't dump blanks on the next line). Which words is unchanged (word-class priority, leading words kept, no repeats). `DIFFICULTY_HIDE_RATIO` is gone; `selectWordsToHide(words, count, seed, { hideAll, avoid })`.
  - **Ten levels** (`modules/game/levels.ts`): Beginner/Intermediate/Advanced 1-3 plus Expert, from 5s down to 1s per blank (Expert = every eligible word, typing only). The difficulty *tier* is still what the game, achievements and ranking call `difficulty`; the stage only tunes density, so stages of one tier share a ranking board. `settings.currentLevel` (a LevelId, synced) is the player's level; picking a level sets it, and a run of `PROMOTION_STARS` (4) or more at or above it moves it up one step (`promotionAfter`, never down). Results shows the level-up. The setup screen offers, per tier, the player's own stage, the top stage of easier tiers and stage 1 of harder ones.
  - **Keys in an empty blank:** Backspace replays the line, Enter skips that word (`controller.skipWord`). Held keys are ignored so holding Backspace to clear text never rolls the song back. On phones a sideways swipe on the active line skips a word (`modules/game/swipe.ts`, `touch-pan-y` keeps vertical scrolling).
  - **Word bank mode** (`wordBank` GameMode, `components/word-bank.tsx`, `modules/game/wordBank.ts`): one bank of 6 buttons holding the next upcoming answers (lowercased, repeats shown once with a count); a pick answers the first open blank of the current line. Words keep their button until used up. Ranked on its own boards; **needs `supabase/migrations/20261013140000_word_bank_mode.sql` run once** after the song-scores migration, until then word-bank scores just aren't ranked.

- **Add a song from just the YouTube link, with lyrics timed for that video** (2026-10-13, admin page `/library/add`).
  - Pasting a link reads the video title and channel through YouTube oEmbed (keyless, CORS-enabled: `services/youtube/youtubeOEmbed.ts`); `parseVideoTitle` turns "Artist - Title (Official Video)" into title + artist (falls back to the channel name). Anything the admin typed is never overwritten. Duplicates are flagged at once and nothing is auto-filled for them; private/non-embeddable videos are flagged as unplayable.
  - **Timing is matched by length.** lrclib has no YouTube ids, and its lyrics are timed against one recording (usually the album cut); music videos often add an intro or a scene, so the *right song* can be timed for the *wrong video* (e.g. Adele "Hello": video 6:07, album 4:55). The sync check's embedded player reports the video's length (available at onReady, verified in Chrome), `rankLyricsMatches` ranks versions closest to it, and `autoPick` only fills in an exact title+artist match within ±3s (`DURATION_TOLERANCE_SECONDS`). If the search's 20 results have none, `getSyncedLyricsForLength` asks lrclib's `/api/get` for that length. If still none, the page says so and points at the official audio upload (`youtubeSearchUrl` searches "official audio", which is the album cut).
  - **Sync check** (`components/lyrics-sync-check.tsx`, behaviour verified in real Chrome with the real YouTube player). Two tools: **Adjust** for a song that is early/late by one amount: a tap when the first line starts (`offsetFromTap`), nudges that replay the current line so the change is heard, a progress bar on the current line, a one-click guess when the video is longer than the recording; the offset is baked into the saved timestamps (`shiftLyrics`). **Retime line by line** for lyrics whose lines are each off by a different amount (e.g. a version whose first lines were spaced 5.2s apart instead of following the singing): play along and tap each line's start (`addTap` takes 0.2s reaction off, ignores out-of-order taps); untapped lines follow the last tapped one (`retimeLyrics`); the result replaces the lyrics text (`formatLRC`) and the offset resets. Every player gets the corrected song; the per-player `songOffsets` stays for fine-tuning.
  - The player passes `origin` in playerVars, which silences YouTube's postMessage origin warning. The googleads/doubleclick CORS errors in the console come from YouTube's own ad tracking inside the iframe and can't be fixed from the app.
  - Finding videos *inside* the app would need a YouTube Data API key.

## Still open

- **Lives / game over** is an untried gameplay change that needs a product decision (as an optional challenge mode at most).
- **Sharing a challenge** with the same blanks (put the session seed in the link).
- **XP can still be farmed by replaying one song** (XP = score, every playthrough). The per-song ranking isn't affected, but the weekly XP board is. Diminishing XP for repeat plays of the same song is the likely fix.
- **Automatic sync calibration.** Not possible fully automatically: the YouTube iframe exposes no audio to analyse and there is no backend. Realistic next steps: store the median offset players chose per song and use it as the default for new players (needs a table + migration), or let an admin save a default `offset` on the song.

- **"Shadowing"/pronunciation practice** mode via the Web Speech API.
- **Contextual notes for idioms/slang**, which a per-word dictionary lookup can't explain (contractions and spoken reductions are now covered by the mistake analyzer, but only when the player gets them wrong).
- **Adaptive difficulty within a song** (the level only changes between songs, via promotion).
- **Mobile typing with the on-screen keyboard** hasn't been tested on a real device: the fixed transport bar and the keyboard compete for a small viewport.
