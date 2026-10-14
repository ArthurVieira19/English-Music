---
name: English Cafe Club
description: A listening-comprehension game where you fill in the blanks of synced song lyrics while the music video plays.
colors:
  brand-navy: "oklch(0.307 0.094 270)"
  brand-blue: "oklch(0.558 0.117 260)"
  brand-red: "oklch(0.57 0.216 25)"
  background: "oklch(0.975 0.008 265)"
  foreground: "oklch(0.307 0.094 270)"
  card: "oklch(1 0 0)"
  primary: "oklch(0.545 0.21 25)"
  primary-foreground: "oklch(1 0 0)"
  secondary: "oklch(0.51 0.12 260)"
  secondary-foreground: "oklch(1 0 0)"
  muted: "oklch(0.95 0.012 265)"
  muted-foreground: "oklch(0.47 0.05 268)"
  accent: "oklch(0.935 0.022 262)"
  accent-foreground: "oklch(0.307 0.094 270)"
  destructive: "oklch(0.53 0.2 24)"
  border: "oklch(0.307 0.094 270 / 12%)"
  focus: "oklch(0.51 0.12 260)"
typography:
  display:
    fontFamily: "Montserrat, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 4vw, 2.25rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "normal"
rounded:
  sm: "0.344rem"
  md: "0.469rem"
  lg: "0.625rem"
  xl: "0.844rem"
  2xl: "1.0625rem"
  full: "9999px"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 10px"
  button-primary-hover:
    backgroundColor: "color-mix(in oklch, {colors.primary} 80%, transparent)"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 10px"
  glass-panel:
    backgroundColor: "color-mix(in oklch, {colors.card} 80%, transparent)"
    textColor: "{colors.foreground}"
    rounded: "{rounded.2xl}"
---

# Design System: English Cafe Club

## 1. Overview

**Creative North Star: "The Club's Own Colours"**

The identity comes straight from the English Cafe Club logo: "ENGLISH" in a mid blue, "Cafe" in a red script, "CLUB" in heavy navy capitals, all on white. The site is that logo's page: white paper, navy ink, one red spotlight, and blue for everything that means "you're getting it". Navy is also the brand's *stage*: the panels that carry the brand (the login brand side, the review hero, the image overlay of today's pick) are deep navy in both themes, with the logo's white-CLUB variant on them.

It is still a music app, not a school form: song art leads, the video and lyrics are the star, motion gives game-like feedback. It is not gray corporate chrome, not a cutesy literacy app, and not a stock template.

**Key Characteristics:**
- Light by default (white like the logo), with an optional navy dark theme
- Navy ink, one red spotlight per screen, blue for right answers and progress
- Navy "stage" panels for brand moments, in both themes
- Frosted `.glass` for real elevated surfaces only
- Difficulty runs like ski pistes: light blue, blue, red, black

## 2. Colors

All tokens live in `src/app/globals.css` (`:root` = light, `.dark` = navy). Interactive red and blue are a shade deeper than the logo's inks so small text clears 4.5:1; the raw inks are `--brand-navy`, `--brand-blue`, `--brand-red` (+ `--brand-sky` tint) for logo-like moments.

### Roles
- **Red** (`--primary`, logo "Cafe"): the primary action on each screen — Play, Start review, Log in, Add song, the due-count badge. Also wrong answers (`--destructive` is the same family), which is why red is never used for in-progress or "you" states.
- **Blue** (`--secondary`, logo "ENGLISH"): right answers, streak, level/XP progress, the active lyric line and the blank you're typing into, "(you)" in rankings, focus rings (`--focus`).
- **Navy** (`--foreground`, logo "CLUB"): all ink, active filter chips, the "Review N words" button (`bg-foreground`), and the `.navy-stage` panels.
- **White / near-white**: `--card` is pure white; `--background` is a near-white tinted toward navy so white cards lift off it.
- **Black**: only the Expert difficulty (`--tier-4`), like a black ski run.

### Difficulty tiers
`--tier-1`..`--tier-4` (Tailwind `text-tier-1`…): Beginner light blue, Intermediate blue, Advanced red, Expert black (white in the dark theme). Used by `DIFFICULTY_TEXT` and the difficulty picker.

### Awards
Medals and stars keep gold/silver/bronze (amber, slate, orange): metal colours carry meaning on their own. Light theme uses deeper shades for contrast.

### Named Rules
**The One Spotlight Rule.** Red is the only colour that means "primary action" on a screen. Progress bars, highlights and "you" rows are blue, never red.

## 3. Typography

**Display Font:** Montserrat — the geometric sans of the logo's "ENGLISH" and "CLUB".
**Body Font:** Instrument Sans.

Display for song titles, page and section headers, score/HUD numbers and the lyric lines; body for everything read at length, labels and buttons. Display sizes stay modest (clamp ceiling ~2.25rem) because the video and lyrics are the star.

## 4. Elevation

`.glass` is the only elevation vocabulary: 80% card fill, `backdrop-blur-[16px] backdrop-saturate-150` (applied with `@apply`; a raw `backdrop-filter` declaration in that rule was dropped by the CSS pipeline, so the glass silently never blurred), a 1px `--border`, an inset top highlight and one short navy-tinted shadow (`--shadow-ink`). Flat surfaces carry no shadow.

`.navy-stage` is the brand surface: navy with a faint blue light from the top right and red from the bottom left. It defines its own inks (`--stage-ink`, `--stage-muted`, `--stage-red`, `--stage-blue`, `--stage-line`). Adding the `dark` class next to it (as the review hero and the today's-pick overlay do) gives everything inside the dark-theme tokens, so shared components read correctly on navy in the light theme too.

## 5. Components

### Logo
`BrandLogo` (`components/brand-logo.tsx`) renders the transparent cut-outs in `src/assets/brand/` (made from `img/logo-english.jpg`): `logo-light.png` keeps the logo's inks, `logo-dark.png` turns CLUB white and lifts the blue and red. `surface="auto"` follows the theme; `surface="navy"` is for `.navy-stage`. Used in the header (h-11/12), the login/sign-up brand panel (h-32+), the mobile auth band and the loading state (pulsing). App icons (`src/app/icon.png`, `apple-icon.png`, `favicon.ico`) are the logo on a white square.

### Buttons
- **Primary:** solid red, white text. **Outline/Ghost:** transparent, navy text, `--border`.
- **Destructive:** low-emphasis by default (`bg-destructive/10`), solid only inside a confirmation dialog.
- Focus: solid blue 2px outline (`--focus`) on every custom control.

### Badges / Chips
- HUD stat pills are `.glass` + full pill. Active filter chip is a navy pill that glides via `layoutId`.
- **Difficulty meter:** four rising bars plus the level name in its tier colour.

### Cards / Containers
- `rounded-2xl` panels, `rounded-xl` rows and media, `rounded-lg` thumbnails. Nothing above ~17px except full pills.
- Song cards are art-first: thumbnail, then title, artist and difficulty on the page; the red play button rises into the art on hover.
- Today's pick: song art under a navy gradient, text in a `dark` scope.

### Inputs / Fields
- White fill (`bg-card`), 1px `--input` border (navy 20%), `rounded-lg`.
- **Fill-in-the-blank (signature):** dashed blue underline, navy bold text, solid on focus; red underline on the last try; a correct answer pops into a blue tint, a wrong one shakes in red.

### Navigation
- `.glass` sticky header (h-16) with the logo, flat links, a light-blue `bg-accent` active pill that glides via `layoutId`, then the streak/level chip, help, admin (admins only), settings, log out.
- Below `md`: fixed `.glass` bottom tab bar with a blue active indicator; hidden on `/game`.

### Game
- Active lyric line: light-blue `bg-accent` with a faint blue ring, gliding line to line.
- Transport bar: rewind, one red Play/Pause, speed, skip, progress. Per-answer feedback (`+150` blue / `miss` red) floats by the score.

### Ambient art
`AmbientArt` blurs the current song's thumbnail into a wash behind the top of Home, setup, game and Results. Decoration only.

### Screen structure
- **Home:** greeting, today's pick hero, progress panel (7-day streak, blue level bar, navy "Review N words" button), shelves.
- **Login / sign-up:** desktop splits into a navy brand panel (logo, `LyricDemo onNavy` with a small equalizer, three feature notes) and the form; phones get a navy band with the logo above the form.
- **Review:** the "words are due" hero is a navy stage.

## 5b. Motion

- 150–250ms for state changes; ~0.9s only for one-shot celebrations.
- `--ease-out-quint` default; springs only for `layoutId` glides. No bounce.
- The equalizer bars on the login panel (`@keyframes eq`) are `motion-safe` only.
- Reduced motion: `MotionConfig reducedMotion="user"` plus the `prefers-reduced-motion` block in `globals.css`.

## 5c. Themes

Light is the default. Settings saved before the rebrand had `theme: "dark"` only because dark was the old default, so `migrateTheme` (storageService) moves them to light once (`themeRevision: 2`); picking Dark again afterwards sticks. The dark theme is deep navy (not black), red and blue lifted for contrast, Expert tier white.

## 6. Do's and Don'ts

### Do:
- **Do** keep the video and the lyrics/typing surface adjacent.
- **Do** keep red for the one primary action (and wrong answers); use blue for progress, highlights and "you".
- **Do** use `BrandLogo` (never a recoloured or stretched logo), `surface="navy"` on navy stages.
- **Do** verify contrast for any new colour pairing (body 4.5:1, large/bold 3:1).
- **Do** give every icon-only control an `aria-label` and pair every animation with a reduced-motion fallback.

### Don't:
- **Don't** reintroduce the old "Marquee" palette (coral, acid lime, warm near-black, film grain).
- **Don't** use pink/red tints for highlights or "your row": that reads as an error.
- **Don't** use gradient text, side-stripe borders, gray dashboard chrome, mascots or cartoon illustration.
- **Don't** let two elements compete for red on the same screen.
