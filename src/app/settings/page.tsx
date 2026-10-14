"use client";

import { useEffect, useState } from "react";
import { Laptop, LogOut, Moon, ShieldCheck, Sun, Trash2, Volume2, VolumeX } from "lucide-react";
import type { Settings } from "@/types/Settings";
import { useAuthStore } from "@/stores/authStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useStatsStore } from "@/stores/statsStore";
import { useAchievementStore } from "@/stores/achievementStore";
import { useReviewStore } from "@/stores/reviewStore";
import { roleLabel } from "@/modules/admin/accountRole";
import { authService } from "@/services/auth/authService";
import { leaderboardService } from "@/services/leaderboard/leaderboardService";
import { resetProgress } from "@/services/supabase/userDataSync";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const THEME_OPTIONS: { value: Settings["theme"]; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Laptop },
];

export default function SettingsPage() {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const displayName = useAuthStore((s) => s.displayName);
  const email = useAuthStore((s) => s.email);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const role = useAuthStore((s) => s.role);
  const userId = useAuthStore((s) => s.userId);
  const [resetStatus, setResetStatus] = useState<"idle" | "done" | "failed">("idle");
  const [signingOut, setSigningOut] = useState(false);
  // null = not known yet (still loading, offline, or the leaderboard setup hasn't been run).
  const [leaderboardHidden, setLeaderboardHidden] = useState<boolean | null>(null);
  const [privacyFailed, setPrivacyFailed] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void leaderboardService.getHidden(userId).then((value) => {
      if (!cancelled) setLeaderboardHidden(value);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function handleLeaderboardVisibility(visible: boolean) {
    const previous = leaderboardHidden;
    setPrivacyFailed(false);
    setLeaderboardHidden(!visible);
    const saved = await leaderboardService.setHidden(!visible);
    if (!saved) {
      setLeaderboardHidden(previous);
      setPrivacyFailed(true);
    }
  }

  async function handleResetProgress() {
    const saved = await resetProgress();
    useStatsStore.getState().loadFromStorage();
    useAchievementStore.getState().loadFromStorage();
    useReviewStore.getState().loadFromStorage();
    useSettingsStore.getState().loadFromStorage();
    setResetStatus(saved ? "done" : "failed");
  }

  function handleSignOut() {
    setSigningOut(true);
    void authService.signOut();
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-12">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-muted-foreground">Everything here is saved to your account.</p>
      </div>

      <Card className="glass border-0">
        <CardHeader>
          <CardTitle className="font-display">Account</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium">
              <span className="truncate">{displayName}</span>
              {isAdmin && (
                <Badge variant="secondary" className="gap-1">
                  <ShieldCheck aria-hidden className="size-3" />
                  {roleLabel(role)}
                </Badge>
              )}
            </p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </div>
          <Button variant="outline" className="shrink-0 gap-1.5" disabled={signingOut} onClick={handleSignOut}>
            <LogOut aria-hidden className="size-4" />
            Log out
          </Button>
        </CardContent>
      </Card>

      <Card className="glass border-0">
        <CardHeader>
          <CardTitle className="font-display">Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <div role="group" aria-label="Theme" className="grid grid-cols-3 gap-2">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={settings.theme === value}
                onClick={() => updateSettings({ theme: value })}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-sm transition-colors",
                  settings.theme === value
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon aria-hidden className="size-4" />
                {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="glass border-0">
        <CardHeader>
          <CardTitle className="font-display">Playback</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label htmlFor="volume" className="flex items-center gap-1.5 text-sm font-medium">
                {settings.volume === 0 ? (
                  <VolumeX aria-hidden className="size-4 text-muted-foreground" />
                ) : (
                  <Volume2 aria-hidden className="size-4 text-muted-foreground" />
                )}
                Volume
              </label>
              <span className="tabular-nums text-sm text-muted-foreground">
                {Math.round(settings.volume * 100)}%
              </span>
            </div>
            <Slider
              id="volume"
              aria-label="Volume"
              min={0}
              max={100}
              value={[Math.round(settings.volume * 100)]}
              onValueChange={(value) => updateSettings({ volume: (value as number[])[0] / 100 })}
            />
            <p className="text-xs text-muted-foreground">Applied the next time you start a song.</p>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <label htmlFor="fuzzy-matching" className="text-sm font-medium">
                Forgiving typing
              </label>
              <p className="text-xs text-muted-foreground">
                Auto-accepts near-misses — a missing apostrophe, a doubled letter, one letter short.
              </p>
            </div>
            <Switch
              id="fuzzy-matching"
              checked={settings.fuzzyMatching}
              onCheckedChange={(checked) => updateSettings({ fuzzyMatching: checked })}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="glass border-0">
        <CardHeader>
          <CardTitle className="font-display">Privacy</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-3">
            <div>
              <label htmlFor="show-on-leaderboard" className="text-sm font-medium">
                Show me on the leaderboard
              </label>
              <p className="text-xs text-muted-foreground">
                Other players see your display name ({displayName}), level and XP — never your email.
              </p>
            </div>
            <Switch
              id="show-on-leaderboard"
              checked={leaderboardHidden === false}
              disabled={leaderboardHidden === null}
              onCheckedChange={(checked) => void handleLeaderboardVisibility(checked)}
            />
          </div>
          {leaderboardHidden === null && (
            <p className="mt-3 text-xs text-muted-foreground">
              Not available right now — the leaderboard may not be set up yet, or you&apos;re offline.
            </p>
          )}
          {privacyFailed && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              Couldn&apos;t save that. Check your connection and try again.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="glass border-0">
        <CardHeader>
          <CardTitle className="font-display text-destructive">Danger zone</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Reset all progress</p>
              <p className="text-xs text-muted-foreground">
                Erases your XP, streaks, statistics, achievements and review words. The song library is
                shared and isn&apos;t affected. Cannot be undone.
              </p>
            </div>
            <Dialog>
              <DialogTrigger
                render={
                  <Button variant="destructive" className="shrink-0 gap-1.5">
                    <Trash2 aria-hidden className="size-4" />
                    Reset
                  </Button>
                }
              />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Reset all progress?</DialogTitle>
                  <DialogDescription>
                    This permanently deletes everything saved to your account — XP, streaks,
                    statistics, achievements and review words. There is no undo.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                  <DialogClose
                    render={
                      <Button variant="destructive" onClick={handleResetProgress}>
                        Yes, erase everything
                      </Button>
                    }
                  />
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          {resetStatus === "done" && (
            <p role="status" className="mt-3 text-sm text-secondary">
              Done — everything&apos;s been reset.
            </p>
          )}
          {resetStatus === "failed" && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              Reset on this device, but we couldn&apos;t reach the server — your saved account data is
              unchanged. Try again when you&apos;re back online.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
