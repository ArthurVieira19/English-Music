# Product

## Register

product

## Users

English learners who practice listening comprehension by filling in the blanks of song lyrics while a YouTube music video plays. Players log in (Supabase Auth) and their progress, XP, streaks and achievements sync to their account, with LocalStorage as an instant cache in front of it; the song library is shared and curated by admins. Sessions are short, focused bursts (one song at a time), often replayed multiple times to improve accuracy.

## Product Purpose

English Cafe Club (the app was called SongGap before the 2026-10-14 rebrand) is an original take on the fill-in-the-missing-lyrics game mechanic: pick a song, watch the music video, type or select the words hidden in the synced lyrics before the line passes. Success looks like a player staying immersed in the video and the music while still being able to type comfortably, understanding at a glance what to do next, and coming back for more songs/streaks without ever hitting a confusing screen. Login happens once; after that the app should feel as instant as a local one.

## Brand Personality

Three words: **immersive, kinetic, encouraging.**

A deliberate mix of Spotify (music-first, content takes the spotlight), Duolingo (game-like feedback — streaks, XP, combo, celebratory micro-moments, forgiving of mistakes) and a modern SaaS product's restraint (fast, uncluttered chrome, no dashboard bloat). The identity is the English Cafe Club logo (img/logo-english.jpg): navy ink, a mid blue, a red script and white paper. Light by default like the logo, with a navy dark theme; navy "stage" panels carry the brand moments. See DESIGN.md. (The earlier "Marquee" coral/lime-on-black theme was replaced on 2026-10-14.)

## Anti-references

- **Generic corporate SaaS.** No gray dashboard chrome, no identical stat-card grids, no "admin panel" seriousness — this is about music and play, not spreadsheets.
- **Childish literacy apps.** Avoid cutesy mascots, oversized rounded shapes, and cartoon illustration typical of kids'-alphabet apps — the tone is closer to a music app than a classroom.
- **Generic/dated templates.** Nothing that reads as an unstyled Bootstrap default or a stock template with no identity of its own.

## Design Principles

1. **Video and lyrics stay close together.** The player is never more than a glance away from the text the user is typing into — proximity beats decoration every time a layout choice has to pick one.
2. **Feedback is immediate and game-like, never punitive.** Correct answers celebrate (motion, color, sound-adjacent visual cues); mistakes give another try (retry-rewind) rather than a dead end.
3. **Glassmorphism is a considered material, not a reflex.** `.glass` frosted panels are the established surface language — use them for real elevated surfaces (player, panels, HUD chips), not as decoration on everything.
4. **Cache-first means zero friction.** After login, every interaction reads from the local cache and feels instant; syncing to the account happens in the background, never behind a spinner.
5. **Playable without a mouse.** Because it's a fast-paced typing game, keyboard flow (tab order, focus rings, auto-focus on the next blank) is as core to the experience as the visuals.

## Accessibility & Inclusion

Target: **WCAG AA.** Minimum 4.5:1 contrast for body text (3:1 for large/bold text), full keyboard operability (including the game loop itself — typing, seeking, retrying), visible focus states on every interactive element, semantic landmarks and ARIA labels for icon-only controls, and a `prefers-reduced-motion` alternative for every animation (the game already relies on Framer Motion for feedback, so this matters more here than on a typical marketing site).
