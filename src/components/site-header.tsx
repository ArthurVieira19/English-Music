"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  BookOpenCheck,
  ChartColumn,
  CircleQuestionMark,
  Flame,
  House,
  LibraryBig,
  LogOut,
  Settings,
  Trophy,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { useReviewStore } from "@/stores/reviewStore";
import { useStatsStore } from "@/stores/statsStore";
import { useAuthStore } from "@/stores/authStore";
import { authService } from "@/services/auth/authService";
import { isPublicPath } from "@/lib/authPaths";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand-logo";

const NAV_LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/library", label: "Library", icon: LibraryBig },
  { href: "/review", label: "Review", icon: BookOpenCheck },
  { href: "/statistics", label: "Stats", icon: ChartColumn },
  { href: "/leaderboard", label: "Ranking", icon: Trophy },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Streak and level, always in view — the two numbers a returning player checks first. */
function ProgressChip() {
  const streak = useStatsStore((s) => s.progress.streak);
  const level = useStatsStore((s) => s.progress.level);
  const isSignedIn = useAuthStore((s) => s.status === "authenticated");
  if (!isSignedIn) return null;

  return (
    <Link
      href="/statistics"
      aria-label={`${streak}-day streak, level ${level}. Open statistics`}
      className="mr-1 flex h-9 items-center gap-2.5 rounded-full border border-border px-3 text-sm font-semibold whitespace-nowrap tabular-nums transition-colors duration-200 hover:bg-accent"
    >
      <span className={cn("flex items-center gap-1", streak > 0 ? "text-secondary" : "text-muted-foreground")}>
        <Flame aria-hidden className="size-4" fill={streak > 0 ? "currentColor" : "none"} />
        {streak}
      </span>
      <span aria-hidden className="h-4 w-px bg-border" />
      <span className="text-muted-foreground">
        Lv <span className="text-foreground">{level}</span>
      </span>
    </Link>
  );
}

function useDueCount() {
  return useReviewStore((s) => s.weakWords.filter((w) => w.nextReviewAt <= Date.now()).length);
}

function DueBadge({ count, className }: { count: number; className?: string }) {
  if (count === 0) return null;
  return (
    <motion.span
      key={count}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      aria-label={`${count} due`}
      className={cn(
        "inline-flex min-w-[1.125rem] items-center justify-center rounded-full bg-primary px-1 text-[0.65rem] leading-[1.125rem] font-semibold text-primary-foreground tabular-nums",
        className,
      )}
    >
      {count}
    </motion.span>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const dueCount = useDueCount();
  const isAuthPage = isPublicPath(pathname);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  // The login/sign-up screens carry their own logo and have nowhere to navigate to.
  if (isAuthPage) return null;

  return (
    <header className="glass sticky top-0 z-40 border-x-0 border-t-0">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4">
        <Link
          href="/"
          aria-label="English Cafe Club, home"
          className="flex items-center rounded-lg transition-transform duration-200 ease-[var(--ease-out-quint)] hover:-rotate-2 active:scale-95"
        >
          <BrandLogo priority className="h-11 md:h-12" />
        </Link>

        <div className="flex items-center gap-1">
          <nav aria-label="Primary" className="hidden gap-1 text-sm md:flex">
            {NAV_LINKS.map((link) => {
              const isActive = isActivePath(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition-colors duration-200",
                    isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="nav-active-pill"
                      aria-hidden
                      className="absolute inset-0 rounded-full bg-accent"
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    />
                  )}
                  <span className="relative">{link.label}</span>
                  {link.href === "/review" && <DueBadge count={dueCount} className="relative" />}
                </Link>
              );
            })}
          </nav>
          <span aria-hidden className="mx-2 hidden h-5 w-px bg-border md:block" />
          <ProgressChip />
          <Link
            href="/how-to-play"
            aria-label="How to play"
            title="How to play"
            aria-current={pathname === "/how-to-play" ? "page" : undefined}
            className={cn(
              "flex size-10 items-center justify-center rounded-full transition-colors duration-200 hover:bg-accent hover:text-foreground md:size-9",
              pathname === "/how-to-play" ? "bg-accent text-foreground" : "text-muted-foreground",
            )}
          >
            <CircleQuestionMark aria-hidden className="size-[1.125rem]" />
          </Link>
          {isAdmin && (
            <Link
              href="/admin/members"
              aria-label="Register players"
              title="Register players"
              aria-current={pathname === "/admin/members" ? "page" : undefined}
              className={cn(
                "flex size-10 items-center justify-center rounded-full transition-colors duration-200 hover:bg-accent hover:text-foreground md:size-9",
                pathname === "/admin/members" ? "bg-accent text-foreground" : "text-muted-foreground",
              )}
            >
              <UserPlus aria-hidden className="size-[1.125rem]" />
            </Link>
          )}
          <Link
            href="/settings"
            aria-label="Settings"
            aria-current={pathname === "/settings" ? "page" : undefined}
            className={cn(
              "group flex size-10 items-center justify-center rounded-full transition-colors duration-200 hover:bg-accent hover:text-foreground md:size-9",
              pathname === "/settings" ? "bg-accent text-foreground" : "text-muted-foreground",
            )}
          >
            <Settings
              aria-hidden
              className="size-[1.125rem] transition-transform duration-300 ease-[var(--ease-out-quint)] group-hover:rotate-45"
            />
          </Link>
          <button
            type="button"
            aria-label="Log out"
            title="Log out"
            onClick={() => void authService.signOut()}
            className="hidden size-9 items-center justify-center rounded-full text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground md:flex"
          >
            <LogOut aria-hidden className="size-[1.125rem]" />
          </button>
        </div>
      </div>
    </header>
  );
}

/**
 * Phone navigation lives at the bottom, within thumb reach. Hidden during a
 * game: that screen's own transport bar owns the bottom edge there, and the
 * header still offers a way out.
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const dueCount = useDueCount();

  if (pathname.startsWith("/game") || isPublicPath(pathname)) return null;

  return (
    <nav
      aria-label="Primary"
      className="glass safe-bottom fixed inset-x-0 bottom-0 z-40 border-x-0 border-b-0 md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5 px-1 pt-1.5">
        {NAV_LINKS.map((link) => {
          const isActive = isActivePath(pathname, link.href);
          const Icon = link.icon;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[0.7rem] font-medium transition-colors duration-200",
                  isActive ? "text-secondary" : "text-muted-foreground active:text-foreground",
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="tab-active-pill"
                    aria-hidden
                    className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-secondary"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                <span className="relative">
                  <Icon aria-hidden className="size-5" strokeWidth={isActive ? 2.25 : 1.75} />
                  {link.href === "/review" && (
                    <DueBadge count={dueCount} className="absolute -top-1.5 -right-3" />
                  )}
                </span>
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
