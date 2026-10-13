"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Check, ExternalLink, Loader2, Search, Sparkles } from "lucide-react";
import type { Song } from "@/types/Song";
import { parseLRC } from "@/modules/lyrics/lrcParser";
import { estimateSongDifficulty } from "@/modules/lyrics/estimateSongDifficulty";
import { autoPick, rankLyricsMatches, DURATION_TOLERANCE_SECONDS } from "@/modules/lyrics/rankLyricsMatches";
import { shiftLyrics } from "@/modules/lyrics/shiftLyrics";
import { parseYoutubeId } from "@/modules/youtube/parseYoutubeId";
import { parseVideoTitle, youtubeSearchUrl } from "@/modules/youtube/parseVideoTitle";
import { getSyncedLyricsForLength, searchSyncedLyrics, type LrclibResult } from "@/services/lyrics/lrclibClient";
import { lookupYoutubeVideo, type YoutubeVideoInfo } from "@/services/youtube/youtubeOEmbed";
import { SONGS } from "@/data/songs";
import { useAuthStore } from "@/stores/authStore";
import { useLibraryStore } from "@/stores/libraryStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LyricsSyncCheck } from "@/components/lyrics-sync-check";
import { cn } from "@/lib/utils";

/** Wait this long after the link stops changing before asking YouTube about it. */
const LOOKUP_DELAY_MS = 350;

function formatDuration(seconds: number): string {
  const totalSeconds = Math.round(seconds);
  const mins = Math.floor(totalSeconds / 60);
  const secs = (totalSeconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

/** "same length as the video", "22s longer than the video", "1:12 shorter than the video". */
function describeDurationDelta(delta: number): string {
  if (Math.abs(delta) <= DURATION_TOLERANCE_SECONDS) return "same length as the video";
  const amount = Math.abs(delta) >= 60 ? formatDuration(Math.abs(delta)) : `${Math.round(Math.abs(delta))}s`;
  return `${amount} ${delta > 0 ? "longer" : "shorter"} than the video`;
}

function slugify(text: string): string {
  const slug = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug || "song";
}

type VideoState =
  | { status: "idle" }
  | { status: "loading"; id: string }
  | { status: "found"; id: string; info: YoutubeVideoInfo }
  | { status: "failed"; id: string; reason: "not-found" | "restricted" | "unavailable" };

const VIDEO_FAILURE_TEXT = {
  "not-found": "YouTube doesn't know this video. Check the link.",
  restricted: "This video is private or can't be played outside YouTube, so it won't play in the game.",
  unavailable: "Couldn't reach YouTube to read the video's details. Fill in the title and artist yourself.",
} as const;

/**
 * Adding a song starts from the YouTube link: the video's title gives the
 * song's title and artist, those find the synced lyrics, and a confident match
 * is picked straight away. Every field stays editable, and nothing the admin
 * typed is ever overwritten by a guess.
 */
export default function AddSongPage() {
  const router = useRouter();
  const addSong = useLibraryStore((s) => s.addSong);
  const librarySongs = useLibraryStore((s) => s.songs);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [youtubeInput, setYoutubeInput] = useState("");
  const [lyricsInput, setLyricsInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Fields the admin has typed into themselves; guesses never overwrite those.
  const editedRef = useRef({ title: false, artist: false, lyrics: false });

  const [video, setVideo] = useState<VideoState>({ status: "idle" });

  const [lyricsSearchLoading, setLyricsSearchLoading] = useState(false);
  const [lyricsSearchError, setLyricsSearchError] = useState<string | null>(null);
  const [lyricsResults, setLyricsResults] = useState<LrclibResult[]>([]);
  const [searchedFor, setSearchedFor] = useState({ title: "", artist: "" });
  const [selectedLyricsId, setSelectedLyricsId] = useState<number | null>(null);
  // Set by an automatic search: pick a sure match as soon as one shows up (the video's length may arrive later).
  const autoPickPendingRef = useRef(false);
  // The (title, artist, length) the length-exact lookup already ran for, so it runs once per combination.
  const lengthLookupRef = useRef("");

  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  /** Seconds the chosen lyrics are moved to fit this video; baked into the song on save. */
  const [syncOffset, setSyncOffset] = useState(0);
  // Bumped by every new search, so a slow answer to an older one is dropped.
  const searchRunRef = useRef(0);

  const youtubeId = parseYoutubeId(youtubeInput);
  const isDuplicate = youtubeId !== null && [...SONGS, ...librarySongs].some((s) => s.youtubeId === youtubeId);

  const lyricsMatches = useMemo(
    () => rankLyricsMatches(lyricsResults, { ...searchedFor, videoDuration }),
    [lyricsResults, searchedFor, videoDuration],
  );
  const parsedLyrics = useMemo(() => parseLRC(lyricsInput), [lyricsInput]);
  const selectedMatch = lyricsMatches.find((match) => match.result.id === selectedLyricsId) ?? null;
  const noVersionFitsVideo =
    videoDuration !== null && lyricsMatches.length > 0 && !lyricsMatches.some((m) => m.timingMatches === true && m.confidence !== "weak");
  // The video runs longer than the chosen lyrics' recording: most often an intro, so offer that as the first guess.
  const suggestedOffset =
    selectedMatch?.durationDelta != null && selectedMatch.durationDelta < -DURATION_TOLERANCE_SECONDS
      ? -selectedMatch.durationDelta
      : null;

  const estimatedDifficulty = useMemo(() => {
    const parsed = parseLRC(lyricsInput);
    return parsed.length > 0 ? estimateSongDifficulty(parsed).level : null;
  }, [lyricsInput]);

  async function runLyricsSearch(searchTitle: string, searchArtist: string, { automatic }: { automatic: boolean }) {
    if (!searchTitle.trim()) {
      setLyricsSearchError("Fill in the title first.");
      return;
    }

    const run = ++searchRunRef.current;
    setLyricsSearchLoading(true);
    setLyricsSearchError(null);
    setLyricsResults([]);
    autoPickPendingRef.current = automatic;

    try {
      const results = await searchSyncedLyrics(searchTitle.trim(), searchArtist.trim());
      if (run !== searchRunRef.current) return;

      setSearchedFor({ title: searchTitle, artist: searchArtist });
      setLyricsResults(results);
      if (results.length === 0) {
        setLyricsSearchError("No synced lyrics found. Check the title and artist, or paste them manually below.");
      }
    } catch {
      if (run === searchRunRef.current) setLyricsSearchError("Lyrics search failed. Paste them manually below.");
    } finally {
      if (run === searchRunRef.current) setLyricsSearchLoading(false);
    }
  }

  // Fill in a sure match (right song, timed for this video's length) once
  // both the results and the video's length are in, unless the admin has
  // already chosen or typed lyrics.
  useEffect(() => {
    if (!autoPickPendingRef.current || editedRef.current.lyrics) return;
    const pick = autoPick(lyricsMatches);
    if (!pick?.result.syncedLyrics) return;

    autoPickPendingRef.current = false;
    setLyricsInput(pick.result.syncedLyrics);
    setSelectedLyricsId(pick.result.id);
    setSyncOffset(0);
  }, [lyricsMatches]);

  // The search returns at most 20 versions and can miss the one cut to the
  // video's length. If none of them fits, ask lrclib for that length directly.
  useEffect(() => {
    if (videoDuration === null || lyricsResults.length === 0 || !noVersionFitsVideo) return;
    const key = `${searchedFor.title}|${searchedFor.artist}|${Math.round(videoDuration)}`;
    if (lengthLookupRef.current === key || !searchedFor.title.trim() || !searchedFor.artist.trim()) return;
    lengthLookupRef.current = key;

    let cancelled = false;
    getSyncedLyricsForLength(searchedFor.title.trim(), searchedFor.artist.trim(), videoDuration)
      .then((found) => {
        if (cancelled || !found) return;
        setLyricsResults((current) => (current.some((r) => r.id === found.id) ? current : [found, ...current]));
      })
      .catch(() => {
        // Only a bonus on top of the search: if it fails, the list and the sync check still work.
      });
    return () => {
      cancelled = true;
    };
  }, [videoDuration, lyricsResults, searchedFor, noVersionFitsVideo]);

  // A new video link: read its title from YouTube, guess the song from it and
  // go looking for the lyrics, all without the admin pressing anything.
  useEffect(() => {
    if (!youtubeId) {
      setVideo({ status: "idle" });
      return;
    }

    // Show the thumbnail (and a duplicate warning) at once; ask YouTube once the link settles.
    setVideo({ status: "loading", id: youtubeId });
    setVideoDuration(null);
    setSyncOffset(0);
    let cancelled = false;
    const timer = setTimeout(async () => {
      const lookup = await lookupYoutubeVideo(youtubeId);
      if (cancelled) return;

      if (!lookup.ok) {
        setVideo({ status: "failed", id: youtubeId, reason: lookup.reason });
        return;
      }
      setVideo({ status: "found", id: youtubeId, info: lookup.info });
      // Already in the library: it can't be added, so don't fill anything in or search for lyrics.
      if (isDuplicate) return;

      const guess = parseVideoTitle(lookup.info.title, lookup.info.channel);
      const nextTitle = editedRef.current.title ? null : guess.title;
      const nextArtist = editedRef.current.artist ? null : guess.artist;
      if (nextTitle !== null) setTitle(nextTitle);
      if (nextArtist !== null) setArtist(nextArtist);

      void runLyricsSearch(nextTitle ?? title, nextArtist ?? artist, { automatic: true });
    }, LOOKUP_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Only a different video should trigger a lookup; title/artist are read as they are at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [youtubeId]);

  function handleSelectLyricsResult(result: LrclibResult) {
    if (!result.syncedLyrics) return;
    editedRef.current.lyrics = true;
    setLyricsInput(result.syncedLyrics);
    setSelectedLyricsId(result.id);
    setSyncOffset(0);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!youtubeId) {
      setError("That doesn't look like a valid YouTube link or video ID.");
      return;
    }

    if (isDuplicate) {
      setError("This song is already in the library.");
      return;
    }

    // The timing correction from the sync check becomes part of the song itself.
    const lyrics = shiftLyrics(parsedLyrics, syncOffset);
    if (lyrics.length === 0) {
      setError(
        "No valid timestamped lines found. Lyrics must use LRC format, e.g. [00:12.50]Some line.",
      );
      return;
    }

    if (!title.trim() || !artist.trim()) {
      setError("Title and artist are required.");
      return;
    }

    const song: Song = {
      id: `${slugify(title)}-${slugify(artist)}-${Date.now().toString(36)}`,
      title: title.trim(),
      artist: artist.trim(),
      youtubeId,
      thumbnail: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
      difficulty: estimateSongDifficulty(lyrics).level,
      lyrics,
    };

    setSaving(true);
    try {
      await addSong(song);
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Couldn't save the song. Try again.");
      setSaving(false);
      return;
    }
    router.push(`/game?id=${encodeURIComponent(song.id)}`);
  }

  // The form is hidden for everyone else, but the database is what actually refuses non-admin writes.
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <p className="text-muted-foreground">Only admins can add songs to the library.</p>
        <Button className="mt-4" render={<Link href="/library" />} nativeButton={false}>
          Back to library
        </Button>
      </div>
    );
  }

  const canSearchYoutube = Boolean(title.trim() || artist.trim());

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <Link
        href="/library"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-3.5" /> Back to library
      </Link>

      <Card className="glass border-0">
        <CardHeader>
          <CardTitle className="font-display text-2xl">Add a song</CardTitle>
          <p className="text-sm text-muted-foreground">
            Paste the YouTube link and the rest fills itself in: title and artist from the video, and synced
            lyrics from lrclib.net timed for a recording as long as the video. Check the timing, then add. Songs you add join the global library and are visible to every
            player, so make sure you have the rights to use the content.
          </p>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="youtube">
                YouTube link or video ID
              </label>
              <Input
                id="youtube"
                placeholder="https://www.youtube.com/watch?v=..."
                value={youtubeInput}
                onChange={(e) => setYoutubeInput(e.target.value)}
                required
              />
              {canSearchYoutube ? (
                <a
                  href={youtubeSearchUrl(title, artist)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink aria-hidden className="size-3" />
                  Find the official audio of &ldquo;{[artist.trim(), title.trim()].filter(Boolean).join(" – ")}&rdquo; on YouTube
                </a>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No link yet? Type the title and artist below to search YouTube for it.
                </p>
              )}

              <VideoPreview video={video} isDuplicate={isDuplicate} />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium" htmlFor="title">
                  Title
                </label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => {
                    editedRef.current.title = true;
                    setTitle(e.target.value);
                  }}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium" htmlFor="artist">
                  Artist
                </label>
                <Input
                  id="artist"
                  value={artist}
                  onChange={(e) => {
                    editedRef.current.artist = true;
                    setArtist(e.target.value);
                  }}
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium" htmlFor="lyrics">
                  Lyrics (LRC format)
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={lyricsSearchLoading || !title.trim()}
                  onClick={() => runLyricsSearch(title, artist, { automatic: false })}
                  className="gap-1.5"
                >
                  {lyricsSearchLoading ? (
                    <Loader2 aria-hidden className="size-3.5 animate-spin" />
                  ) : (
                    <Search aria-hidden className="size-3.5" />
                  )}
                  Find lyrics
                </Button>
              </div>

              {lyricsSearchError && (
                <p role="status" className="text-sm text-muted-foreground">
                  {lyricsSearchError}
                </p>
              )}

              {lyricsMatches.length > 0 && (
                <div
                  role="group"
                  aria-label="Lyrics found"
                  className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-md border border-border p-1.5"
                >
                  {lyricsMatches.map(({ result, confidence, durationDelta, timingMatches }, index) => {
                    const selected = result.id === selectedLyricsId;
                    return (
                      <button
                        key={result.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => handleSelectLyricsResult(result)}
                        className={cn(
                          "flex items-start justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent",
                          selected && "bg-primary/10 ring-1 ring-primary/30",
                        )}
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">
                            {result.trackName} — {result.artistName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {result.albumName || "Unknown album"} · {formatDuration(result.duration)}
                            {durationDelta !== null && (
                              <span className={cn(timingMatches ? "text-secondary" : "text-orange-400")}>
                                {" "}· {describeDurationDelta(durationDelta)}
                              </span>
                            )}
                          </span>
                        </span>
                        {selected ? (
                          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
                            <Check aria-hidden className="size-3.5" /> In use
                          </span>
                        ) : (
                          index === 0 &&
                          confidence !== "weak" &&
                          timingMatches !== false && (
                            <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                              <Sparkles aria-hidden className="size-3" /> Best match
                            </span>
                          )
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {noVersionFitsVideo && (
                <div role="status" className="flex flex-col gap-1 rounded-md border border-orange-400/40 bg-orange-400/10 p-2.5 text-sm">
                  <p className="flex items-start gap-1.5">
                    <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0 text-orange-400" />
                    <span>
                      None of these versions is as long as this video ({formatDuration(videoDuration ?? 0)}), so their
                      timing won&apos;t line up on its own. Music videos often add an intro or a scene.
                    </span>
                  </p>
                  <p className="pl-5 text-xs text-muted-foreground">
                    Pick the right song anyway and line it up with one tap below, or use the song&apos;s{" "}
                    <a
                      href={youtubeSearchUrl(title, artist)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-foreground underline underline-offset-2"
                    >
                      official audio upload
                    </a>
                    , which usually matches exactly.
                  </p>
                </div>
              )}

              <textarea
                id="lyrics"
                required
                rows={8}
                value={lyricsInput}
                onChange={(e) => {
                  editedRef.current.lyrics = true;
                  setSelectedLyricsId(null);
                  setLyricsInput(e.target.value);
                }}
                placeholder={"[00:01.00]First line\n[00:05.00]Second line"}
                className="rounded-md border border-input bg-input/30 px-3 py-2 font-mono text-sm outline-none focus:border-primary"
              />
              <p role="status" className="text-sm text-muted-foreground">
                {estimatedDifficulty ? (
                  <>
                    Estimated difficulty:{" "}
                    <span className="font-medium capitalize text-foreground">{estimatedDifficulty}</span>{" "}
                    &mdash; worked out from how fast, varied and slangy the lyrics are.
                  </>
                ) : (
                  "Difficulty is set automatically once valid lyrics are added."
                )}
              </p>
            </div>

            {youtubeId && !(video.status === "failed" && video.reason !== "unavailable") && (
              <LyricsSyncCheck
                youtubeId={youtubeId}
                lines={parsedLyrics}
                offset={syncOffset}
                onOffsetChange={setSyncOffset}
                onDuration={setVideoDuration}
                suggestedOffset={suggestedOffset}
              />
            )}

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" className="mt-2 gap-2 self-start" disabled={saving}>
              {saving && <Loader2 aria-hidden className="size-4 animate-spin" />}
              Add song and play
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

/** What the pasted link points at, so the admin can see it's the right video before going further. */
function VideoPreview({ video, isDuplicate }: { video: VideoState; isDuplicate: boolean }) {
  if (video.status === "idle") return null;

  return (
    <div className="mt-1 flex items-center gap-3 rounded-lg border border-border p-2" aria-live="polite">
      {/* eslint-disable-next-line @next/next/no-img-element -- static export: no image optimizer */}
      <img
        src={`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`}
        alt=""
        className="aspect-video w-24 shrink-0 rounded object-cover"
      />
      <div className="min-w-0 flex-1 text-sm">
        {video.status === "loading" && (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 aria-hidden className="size-3.5 animate-spin" /> Reading the video…
          </p>
        )}
        {video.status === "found" && (
          <>
            <p className="truncate font-medium">{video.info.title}</p>
            <p className="truncate text-xs text-muted-foreground">{video.info.channel}</p>
          </>
        )}
        {video.status === "failed" && (
          <p className="flex items-start gap-1.5 text-muted-foreground">
            <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0 text-orange-400" />
            {VIDEO_FAILURE_TEXT[video.reason]}
          </p>
        )}
        {isDuplicate && (
          <p role="alert" className="mt-1 text-xs font-medium text-destructive">
            This video is already in the library.
          </p>
        )}
      </div>
    </div>
  );
}
