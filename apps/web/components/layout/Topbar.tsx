"use client";

import * as React from "react";
import Link from "@/components/ui/IntentLink";
import { usePathname } from "next/navigation";
import { Bell, ExternalLink, LogOut, Monitor, Moon, RefreshCw, Search, Settings, Sun } from "lucide-react";
import { navItemFor } from "./nav";
import { EXTERNAL_LINK_PROPS, safeHttpUrl } from "./external-links";
import { ThemeToggle } from "./ThemeToggle";
import { useTheme, type ThemePreference } from "./ThemeProvider";
import { Button, buttonClass } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Logo } from "@/components/ui/Logo";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/Menu";
import { cn, titleCase } from "@/lib/utils";

const noopSubscribe = () => () => {};
const isApplePlatform = () => /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

/** False on the server and during hydration, then the real answer, so there is no mismatch. */
function useIsApple() {
  return React.useSyncExternalStore(noopSubscribe, isApplePlatform, () => false);
}

export function Topbar({
  studentName,
  registerNumber,
  photoUrl,
  unreadCount,
  onOpenCommand,
  onRefresh,
  refreshing,
  onLogout,
  erpUrl,
  lmsUrl,
  connectionStatus,
}: {
  studentName: string;
  registerNumber: string;
  photoUrl?: string;
  unreadCount: number;
  onOpenCommand: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  onLogout: () => void;
  /** Real portal addresses; a link renders only for http(s) values. */
  erpUrl?: string;
  lmsUrl?: string;
  connectionStatus?: React.ReactNode;
}) {
  const erpHref = safeHttpUrl(erpUrl);
  const lmsHref = safeHttpUrl(lmsUrl);
  const pathname = usePathname();
  const { preference, setPreference } = useTheme();
  const isApple = useIsApple();
  const title = navItemFor(pathname)?.label ?? "Student Portal";
  const name = titleCase(studentName);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b border-border bg-background/90 px-4 backdrop-blur sm:px-6 lg:px-8">
      <Link href="/" aria-label="Student Portal home" className="mr-2 rounded-lg focusable lg:hidden">
        <Logo className="h-8 w-8" />
      </Link>
      <div className="min-w-0 flex-1">
        {/* A plain paragraph on purpose: the page keeps the only h1. Hidden on phones, where the h1 sits right below. */}
        <p className="hidden truncate font-display text-subheading font-semibold text-foreground sm:block">
          {title}
        </p>
      </div>

      <button
        type="button"
        onClick={onOpenCommand}
        aria-label="Search pages"
        aria-keyshortcuts="Control+K Meta+K"
        className={cn(
          "grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focusable",
          "lg:mr-1 lg:flex lg:h-9 lg:w-64 lg:items-center lg:justify-start lg:gap-2 lg:border lg:border-input lg:bg-surface lg:px-3 lg:text-small",
        )}
      >
        <Search className="h-[18px] w-[18px] shrink-0 md:h-4 md:w-4" aria-hidden />
        <span className="hidden flex-1 text-left md:inline">Search pages</span>
        <kbd className="hidden rounded-md bg-muted px-1.5 py-0.5 font-sans text-micro font-medium md:inline" aria-hidden>
          {isApple ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>

      {erpHref ? (
        <a
          href={erpHref}
          {...EXTERNAL_LINK_PROPS}
          title="Open the ERP"
          className={buttonClass("ghost", "icon", "shrink-0 md:w-auto md:gap-1.5 md:px-2.5")}
        >
          <ExternalLink className="h-[18px] w-[18px] md:h-4 md:w-4" aria-hidden />
          <span className="sr-only">Open ERP (opens in a new tab)</span>
          <span className="hidden md:inline" aria-hidden>
            ERP
          </span>
        </a>
      ) : null}

      <Link
        href="/notifications"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        className={buttonClass("ghost", "icon", "relative shrink-0")}
      >
        <Bell className="h-[18px] w-[18px]" aria-hidden />
        {unreadCount > 0 ? (
          <span
            className="absolute right-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-micro font-semibold leading-none text-danger-foreground md:right-0 md:top-0"
            aria-hidden
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </Link>

      <ThemeToggle />

      <Button
        variant="ghost"
        size="icon"
        onClick={onRefresh}
        disabled={refreshing}
        aria-label="Refresh data"
        title="Refresh data"
        className="hidden lg:inline-flex"
      >
        <RefreshCw className={cn("h-[18px] w-[18px]", refreshing && "animate-spin")} aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onLogout}
        aria-label="Log out"
        title="Log out"
        className="hidden lg:inline-flex"
      >
        <LogOut className="h-[18px] w-[18px]" aria-hidden />
      </Button>

      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            aria-label="Account menu"
            data-tour="account-menu"
            className="ml-1 grid h-11 w-11 shrink-0 place-items-center rounded-full focusable lg:h-9 lg:w-9"
          >
            <Avatar name={studentName} src={photoUrl} className="h-8 w-8 rounded-full text-micro" />
          </button>
        </MenuTrigger>
        <MenuContent className="w-64">
          <div className="px-2.5 py-2">
            <p className="truncate text-body font-medium text-foreground">{name}</p>
            <p className="truncate text-small tabular-nums text-muted-foreground">{registerNumber}</p>
            {connectionStatus ? <div className="mt-1.5">{connectionStatus}</div> : null}
          </div>
          <MenuSeparator />
          <MenuLabel>Theme</MenuLabel>
          <MenuRadioGroup
            value={preference}
            onValueChange={(v: string) => setPreference(v as ThemePreference)}
          >
            <MenuRadioItem value="light">
              <Sun className="h-4 w-4 text-muted-foreground" aria-hidden />
              Light
            </MenuRadioItem>
            <MenuRadioItem value="dark">
              <Moon className="h-4 w-4 text-muted-foreground" aria-hidden />
              Dark
            </MenuRadioItem>
            <MenuRadioItem value="system">
              <Monitor className="h-4 w-4 text-muted-foreground" aria-hidden />
              System
            </MenuRadioItem>
          </MenuRadioGroup>
          <MenuSeparator />
          {erpHref || lmsHref ? (
            <>
              {erpHref ? (
                <MenuItem asChild>
                  <a href={erpHref} {...EXTERNAL_LINK_PROPS}>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" aria-hidden />
                    <span>
                      Open ERP<span className="sr-only"> (opens in a new tab)</span>
                    </span>
                  </a>
                </MenuItem>
              ) : null}
              {lmsHref ? (
                <MenuItem asChild>
                  <a href={lmsHref} {...EXTERNAL_LINK_PROPS}>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" aria-hidden />
                    <span>
                      Open LMS<span className="sr-only"> (opens in a new tab)</span>
                    </span>
                  </a>
                </MenuItem>
              ) : null}
              <MenuSeparator />
            </>
          ) : null}
          <MenuItem asChild>
            <Link href="/settings">
              <Settings className="h-4 w-4 text-muted-foreground" aria-hidden />
              Settings
            </Link>
          </MenuItem>
          <MenuItem onSelect={onRefresh} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4 text-muted-foreground", refreshing && "animate-spin")} aria-hidden />
            Refresh data
          </MenuItem>
          <MenuItem onSelect={onLogout} danger>
            <LogOut className="h-4 w-4" aria-hidden />
            Log out
          </MenuItem>
        </MenuContent>
      </Menu>
    </header>
  );
}
