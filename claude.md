# Project: English Cafe Club (formerly SongGap)

## Vision

Create a modern web application based on the well-known "fill in the missing lyrics" listening game format, but with a completely original user experience, visual identity, architecture, and codebase.

The focus is on learning English through listening comprehension using music videos from YouTube.

Accounts and storage (changed 2026-09-30 — this replaces the original "no accounts, no backend" rule):

- Login is required to play. Accounts use Supabase Auth (email + password, email confirmation off).
- Each player's progress is saved to Supabase (`user_data`), so a leaderboard can be built on it later.
- The song library is global (`songs` table): every player reads it, only admins (`profiles.is_admin`) can add, edit or remove songs. This is enforced by row level security, not just by hiding buttons.
- The browser talks to Supabase directly, plus Supabase Edge Functions for anything that needs the `service_role` key (see "Admin: registering players").

The application should feel like a mix of:

- Spotify
- Duolingo
- Modern SaaS product

Clean animations, glassmorphism, smooth transitions and game-like feedback.

Brand (2026-10-14): the site is **English Cafe Club**. The logo is `img/logo-english.jpg`; transparent cut-outs live in `src/assets/brand/` (rendered by `components/brand-logo.tsx`) and the app icons are `src/app/icon.png`, `apple-icon.png`, `favicon.ico`. Palette from the logo: navy ink, red for the one primary action (and wrong answers), blue for right answers/progress/highlights, white paper; light theme by default. Full system in DESIGN.md. Storage keys keep the old `songgap:` prefix on purpose (renaming them would wipe every cache).

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

Server-side logic lives in Supabase Edge Functions (source in `supabase/functions/`, deployed to the Supabase project), never in a backend of our own. The site itself runs in the browser. The site is a static export (`output: "export"`) hosted on GitHub Pages (`.github/workflows/pages.yml`, base path = the repository name, set by the workflow via `NEXT_PUBLIC_BASE_PATH`), so there is no middleware: `AuthGate` gates pages behind login on the client. The game route is `/game?id=<songId>` because song ids come from the database and cannot be pre-rendered.

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

- **Spaced-repetition review mode.** Missed words go into a cross-song "weak words" pool (`reviewStore`, synced to the player's account), one entry per word per line of a song, each carrying the lyric line it was missed in. The `/review` screen resurfaces the due ones as fill-in-the-blank cards, each replaying the video of the moment it was missed (see "Review replays the exact moment" below). Interval ladder lives in `modules/review/spacedRepetition.ts` (1/3/7/16/35 days); a word only earns interval credit once its delay has actually elapsed, so a repeated chorus can't "master" a word in one playthrough.
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

- **Admin: registering players** (2026-10-14, `/admin/members`, header icon for admins only). The admin enters Name, Birth date, Email and Password; the player then logs in with that email + password like anyone else.
  - Accounts are created by the **`create-member` Edge Function** (`supabase/functions/create-member/index.ts`, `verify_jwt` on). It resolves the caller from their token, requires `profiles.is_admin`, then calls `auth.admin.createUser` with the `service_role` key that Supabase injects server-side. This is why there is now server-side code: the key can never ship in the site, and `signUp` from the browser would log the admin out. If saving the private details fails, the new account is deleted again.
  - Birth date and email go to **`member_private`** (admin-only read via RLS, no client writes), not `profiles`, because every signed-in player can read `profiles`. Migration `supabase/migrations/20261014120000_member_private.sql` (already run).
  - Form rules live in `modules/admin/memberForm.ts` and mirror the function's checks; the browser side is `services/admin/memberService.ts`.
  - **Account types** (2026-10-14): Admin, Teacher, Player (`modules/admin/accountRole.ts`, `profiles.role`). `profiles.is_admin` stays the permission flag that `is_admin()`, the songs RLS and the Edge Function check, and means "full control": true for admin *and* teacher (a DB check keeps `role` and `is_admin` in agreement). A teacher can therefore also register admins. Players can only play. The admin picks the type on the registration form; the function sets it after `createUser`. `authStore.role` only drives the badge in Settings. **Needs `supabase/migrations/20261014140000_account_roles.sql` run once**, then the updated `create-member` function deployed.
  - The public `/signup` page still exists, so self-registration is still possible. Remove it (and turn off "Allow new users to sign up" in Supabase) if only admins should create accounts.
  - Dashboard setting still off: Auth > Passwords > leaked password protection (plan dependent).

- **Review replays the exact moment** (2026-10-15). A missed word now carries `clip: {start, end}` (lyric time) next to `contextText`, and the `/review` card plays that stretch of the video before asking for the word. Needs **no migration**: `weak_words` is a JSON blob, and words saved earlier are handled without it.
  - **The clip is the original lyric line, not the game's chunk.** The game plays groups of several LRC lines (often 6-14s); `findSourceLine` (`modules/review/reviewClip.ts`) maps the missed token's index back to the one source line it was sung in, so `contextText` and `clip` are just that line. If the group can't be traced in `song.lyrics` it falls back to the whole group.
  - **Spaced repetition is per place, not per word.** An entry is identified by song + line text + word (`weakWordKey` in `modules/review/weakWordKey.ts`, compared case- and spacing-insensitively), so "love" missed in two songs is two entries, each with its own clip and its own ladder; a chorus that comes round again in one song is still one entry (the latest clip wins). `recordCorrect` / `removeWord` take a `WeakWordRef` ({word, songId, contextText}) instead of a bare word, and the game credits a right answer only to the entry made in that same line. `progress.wordsMastered` still counts words: it ticks when the last entry of a word is cleared.
  - **Old words get pinned to a line at login.** Words saved before this (one per word, no `clip`, the game's whole chunk as `contextText`) are upgraded by `reviewStore.upgradeLegacy`, which `AuthProvider` runs right after the library loads: `upgradeWeakWords` finds the line again in the song's lyrics (`findClipForWord`; first line holding the word if the chunk has it twice), narrows `contextText` to it, sets the `clip`, and merges entries that end up the same place (schedule of the one seen last, histories added). Changing `contextText` changes the key, which is why this is one pass in the store and not done lazily. A song that left the library, or a line that can't be found, stays as it was and gives a text-only card. `buildReviewItems` still looks the clip up at display time for entries not upgraded yet (e.g. the library failed to load). `youtubeId` is looked up from the library, never stored on the word.
  - **One card per line.** Words missed in the same line of the same song share a card: one clip, inline inputs for each word, each word graded and scheduled on its own entry.
  - **"I don't know"** under Check: fills nothing in for you, counts every blank left empty as a miss (a blank already typed is graded normally), and always waits for Continue so the answer can be read. Check itself still wants every blank filled.
  - **Player** (`components/review-clip-player.tsx`): `YouTubePlayer` with `controls: false` (new option) wrapped in `OffsetMediaPlayer`, so the player's saved per-song sync offset applies and the clip is the same moment the game plays. Starts 2s before the line (`CLIP_LEAD_IN_SECONDS`, so the player has time to get ready; it also lets up to 2s of the previous line leak in), at least 1.5s and at most 12s long (`clipWindow`; a line's `end` is the next line's start, so one before an instrumental break would run on), eases out and pauses with `lineEndState` like the game. Plays by itself on each card, but browsers that block sound until a tap leave it paused, so the Replay button is always there. The iframe is inert (`pointer-events-none`), so the only way to move around the video is our buttons. A wrong answer plays the line again with the answer on screen and waits for Continue.
  - Not verified in a real browser or on a phone (the Chrome DevTools MCP didn't connect): the player is covered by tests against a fake YouTube, not the real iframe. Worth a manual look at autoplay and `playsinline` on iOS.
  - `/review` list: each word has a "Practice now" button (any saved word, due or not; a miss resets its interval, a hit before it is due only counts, as `applyCorrect` already does).

- **Game screen fits one viewport** (2026-10-15, `components/game-screen.tsx`). Nothing on the page scrolls except the lyrics panel, and nothing that comes and goes pushes the answer buttons around.
  - The screen is `100dvh` minus the 4rem header, laid out as a grid with areas `video` / `lyrics` / `dock`. Phones stack them (video capped at 30dvh, lyrics take the rest, dock at the bottom for thumb reach). From `lg` it is two columns: video over the dock on the left, lyrics filling the right. There the video is the largest 16:9 box that fits its area, done with a size container query (`lg:[container-type:size]` + `min(100cqw, 100cqh*16/9)`). `LyricsPanel` is now `h-full` and takes its height from the screen.
  - The dock is the answer buttons (choices now in one row of 4 from `sm`, word bank 6 across from `lg`, both `min-h-11`) plus the transport bar, which is no longer `fixed` on phones but sits in the dock. `main` drops its tab-bar padding on this page via `.pb-safe-bar:has([data-game-screen])` in globals.css.
  - The "Paused · Replay line" notice and mistake notes float over the video (bottom and top edge) instead of being inserted above the choices, and the transport bar's Replay button turns red and pulses while paused. In Choice mode the choice row is always there, with empty slots between blanks, so the video never resizes as blanks come and go.
  - "Lyrics out of sync?" is an icon in the transport bar (`SyncControl compact`); the tips and keyboard shortcuts moved behind a `?` button next to the score.
  - Not checked in a real browser yet: the generated CSS was verified against the dev server, the layout itself was not seen.

## Still open

- **Lives / game over** is an untried gameplay change that needs a product decision (as an optional challenge mode at most).
- **Sharing a challenge** with the same blanks (put the session seed in the link).
- **XP can still be farmed by replaying one song** (XP = score, every playthrough). The per-song ranking isn't affected, but the weekly XP board is. Diminishing XP for repeat plays of the same song is the likely fix.
- **Automatic sync calibration.** Not possible fully automatically: the YouTube iframe exposes no audio to analyse and there is no server that hears the audio. Realistic next steps: store the median offset players chose per song and use it as the default for new players (needs a table + migration), or let an admin save a default `offset` on the song.

- **Dictation mode ("type the whole phrase")** as a separate game mode (idea 2026-10-15, to be worked on later). Review and the game blank out individual words; this would play a line (or a short stretch) and have the player type the entire phrase, graded word by word. Review clips (`WeakWord.clip`, `ReviewClipPlayer`, `clipWindow`) are the building blocks: a line, its video, and a player that stops at the end. Open questions: where lines come from outside Review (any lyric line of a song vs. only ones the player missed), how to score a partly right phrase, and whether it feeds the weak-word pool (the words missed in it) or is its own thing.
- **"Shadowing"/pronunciation practice** mode via the Web Speech API.
- **Contextual notes for idioms/slang**, which a per-word dictionary lookup can't explain (contractions and spoken reductions are now covered by the mistake analyzer, but only when the player gets them wrong).
- **Adaptive difficulty within a song** (the level only changes between songs, via promotion).
- **Mobile typing with the on-screen keyboard** hasn't been tested on a real device: the one-viewport game screen (see "Game screen fits one viewport") and the keyboard compete for a small viewport.
