import * as React from "react";
import {
  ArrowLeft,
  ArrowRight,
  BatteryFull,
  BookOpen,
  Bookmark,
  Calculator,
  Camera,
  ChevronLeft,
  Clock,
  Copy,
  Download,
  Ellipsis,
  EllipsisVertical,
  Globe,
  History,
  Image as ImageIcon,
  Info,
  Lock,
  Mail,
  MessageCircle,
  MonitorSmartphone,
  Music,
  Phone,
  Plus,
  RotateCw,
  Search,
  Settings,
  Share,
  Signal,
  SquarePlus,
  Star,
  Wifi,
  X,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { PORTAL_HOST, type View } from "@/lib/guides";

/** Bookmark name in the browser-chrome mock screens. */
const BOOKMARK_NAME = "erpconnect";
import { cn } from "@/lib/utils";
import { hasFlag, MockPage } from "./pages";

const ico = "h-[1.15rem] w-[1.15rem]";

export function StatusBar({ os, tone = "surface" }: { os: "android" | "ios"; tone?: "surface" | "clear" | "light" }) {
  return (
    <div
      className={cn(
        "relative z-20 flex h-[2.6rem] shrink-0 items-center justify-between font-semibold",
        os === "ios" ? "px-[1.9rem] pt-[0.3rem] text-[0.85rem]" : "px-[1.4rem] text-[0.78rem]",
        tone === "surface" && "bg-surface text-foreground",
        tone === "clear" && "text-foreground",
        tone === "light" && "text-white",
      )}
    >
      <span className="tabular-nums">9:41</span>
      <span className="flex items-center gap-[0.3rem]">
        <Signal className="h-[0.85rem] w-[0.85rem]" strokeWidth={2.5} />
        <Wifi className="h-[0.85rem] w-[0.85rem]" strokeWidth={2.5} />
        <BatteryFull className="h-[1rem] w-[1rem]" strokeWidth={2} />
      </span>
    </div>
  );
}

/** Address text: typed out when the view says so, with a caret. */
export function AddressText({ view, placeholder, typed }: { view: View; placeholder: string; typed?: string }) {
  const typing = hasFlag(view, "typing");
  if (typed !== undefined) {
    return (
      <span className="min-w-0 truncate text-foreground">
        <span key={typed} className="guide-typing">
          {typed}
        </span>
        <span className="guide-caret" />
      </span>
    );
  }
  if (!view.url) return <span className="min-w-0 truncate text-muted-foreground">{placeholder}</span>;
  if (typing) {
    return (
      <span className="min-w-0 truncate text-foreground">
        <span key={view.url} className="guide-typing">
          {view.url}
        </span>
        <span className="guide-caret" />
      </span>
    );
  }
  return <span className="min-w-0 truncate text-foreground">{view.url}</span>;
}

/** A plain on-screen keyboard that slides up while typing. */
function Keyboard({ os }: { os: "android" | "ios" }) {
  const rows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
  return (
    <div className={cn("guide-keyboard absolute inset-x-0 bottom-0 z-30 px-[0.25rem] pb-[1.4rem] pt-[0.5rem]", os === "ios" ? "bg-[#d3d7dc] dark:bg-[#2b2f33]" : "bg-surface-2")}>
      {rows.map((row, r) => (
        <div key={row} className="mb-[0.45rem] flex justify-center gap-[0.25rem]" style={{ paddingInline: `${r * 0.9}rem` }}>
          {row.split("").map((k) => (
            <span key={k} className="grid h-[2.5rem] flex-1 place-items-center rounded-[0.35rem] bg-surface text-[0.95rem] text-foreground shadow-[0_1px_0_hsl(0_0%_0%/0.18)]">
              {k}
            </span>
          ))}
        </div>
      ))}
      <div className="flex gap-[0.25rem] px-[0.2rem]">
        <span className="grid h-[2.5rem] w-[3.5rem] place-items-center rounded-[0.35rem] bg-muted text-[0.8rem] text-foreground">?123</span>
        <span className="h-[2.5rem] flex-1 rounded-[0.35rem] bg-surface shadow-[0_1px_0_hsl(0_0%_0%/0.18)]" />
        <span className="grid h-[2.5rem] w-[3.5rem] place-items-center rounded-[0.35rem] bg-primary text-[0.8rem] text-primary-foreground">Go</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Android: Chrome
// ---------------------------------------------------------------------------

function ChromeMenu() {
  const rows: { label: string; Icon: typeof Plus; target?: string }[] = [
    { label: "New tab", Icon: Plus },
    { label: "History", Icon: History },
    { label: "Downloads", Icon: Download },
    { label: "Bookmarks", Icon: Star },
    { label: "Share…", Icon: Share },
    { label: "Install app", Icon: MonitorSmartphone, target: "install-app" },
    { label: "Desktop site", Icon: Globe },
    { label: "Settings", Icon: Settings },
  ];
  return (
    <div className="guide-pop absolute right-[0.4rem] top-[2.9rem] z-30 w-[14.5rem] origin-top-right rounded-[0.9rem] bg-surface py-[0.35rem] text-[0.88rem] shadow-pop ring-1 ring-border">
      <div className="flex items-center justify-between border-b border-border px-[0.9rem] pb-[0.5rem] pt-[0.3rem] text-muted-foreground">
        <ArrowRight className={ico} />
        <span data-target="star" className="rounded-full p-[0.2rem]">
          <Star className={ico} />
        </span>
        <Download className={ico} />
        <Info className={ico} />
        <RotateCw className={ico} />
      </div>
      {rows.map(({ label, Icon, target }) => (
        <span key={label} data-target={target} className="flex items-center gap-[0.85rem] px-[0.9rem] py-[0.55rem] text-foreground">
          <Icon className={cn(ico, "text-muted-foreground")} />
          {label}
        </span>
      ))}
    </div>
  );
}

function Scrim({ children }: { children: React.ReactNode }) {
  return <div className="guide-fade absolute inset-0 z-30 bg-black/45">{children}</div>;
}

function ChromeInstallDialog() {
  return (
    <Scrim>
      <div className="guide-pop absolute inset-x-[1.25rem] top-[15rem] rounded-[1.5rem] bg-surface p-[1.4rem] shadow-pop">
        <p className="font-display text-[1.2rem] font-semibold">Install app</p>
        <div className="mt-[1rem] flex items-center gap-[0.8rem]">
          <Logo className="h-[3rem] w-[3rem] shrink-0" />
          <div className="min-w-0">
            <p className="text-[0.95rem] font-semibold">Unified Student Portal</p>
            <p className="truncate text-[0.78rem] text-muted-foreground">{PORTAL_HOST}</p>
          </div>
        </div>
        <div className="mt-[1.4rem] flex justify-end gap-[0.5rem] text-[0.88rem] font-semibold">
          <span className="rounded-full px-[1rem] py-[0.6rem] text-primary">Cancel</span>
          <span data-target="install-confirm" className="rounded-full bg-primary px-[1.2rem] py-[0.6rem] text-primary-foreground">
            Install
          </span>
        </div>
      </div>
    </Scrim>
  );
}

function BookmarkSnackbar() {
  return (
    <div className="guide-rise absolute inset-x-[0.75rem] bottom-[1.4rem] z-30 flex items-center justify-between rounded-[0.6rem] bg-foreground px-[1rem] py-[0.85rem] text-[0.85rem] text-background shadow-pop">
      <span>Bookmarked in Mobile bookmarks</span>
      <span data-target="edit-bookmark" className="rounded-[0.4rem] px-[0.4rem] py-[0.1rem] font-semibold text-[#8fd8c4] dark:text-primary-foreground">
        Edit
      </span>
    </div>
  );
}

function BookmarkEditor({ view }: { view: View }) {
  const named = hasFlag(view, "name-typed");
  const pasted = hasFlag(view, "url-pasted");
  const box = "mt-[0.3rem] flex min-h-[2.9rem] items-center rounded-[0.6rem] border-2 px-[0.8rem] text-[0.88rem]";
  return (
    <div className="guide-sheet absolute inset-x-0 bottom-0 top-[2.6rem] z-30 bg-surface">
      <div className="flex items-center gap-[0.8rem] border-b border-border px-[0.8rem] py-[0.8rem]">
        <ArrowLeft className={ico} />
        <span className="text-[1.05rem] font-semibold">Edit bookmark</span>
        <span data-target="bm-save" className="ml-auto rounded-full bg-primary px-[1rem] py-[0.4rem] text-[0.85rem] font-semibold text-primary-foreground">
          Save
        </span>
      </div>
      <div className="space-y-[1.1rem] px-[1rem] py-[1.2rem]">
        <div>
          <p className="text-[0.75rem] font-medium text-muted-foreground">Name</p>
          <span data-target="bm-name" className={cn(box, named ? "border-primary" : "border-input")}>
            {named ? (
              <span key="named" className="guide-typing [--guide-type-ms:700ms]">
                {BOOKMARK_NAME}
              </span>
            ) : (
              <span className="truncate">Connect from your phone · Student Portal</span>
            )}
          </span>
        </div>
        <div>
          <p className="text-[0.75rem] font-medium text-muted-foreground">URL</p>
          <span data-target="bm-url" className={cn(box, "break-all py-[0.5rem]", pasted ? "border-primary font-mono text-[0.75rem]" : "border-input")}>
            {pasted ? (
              <span key="pasted" className="guide-fade">
                javascript:(()=&gt;&#123;const p=&quot;https://{PORTAL_HOST}&quot;;…&#125;)()
              </span>
            ) : (
              <span className="truncate">{PORTAL_HOST}/connect/phone</span>
            )}
          </span>
          {pasted ? <p className="guide-fade mt-[0.4rem] text-[0.75rem] font-medium text-success">Pasted the connect link</p> : null}
        </div>
        <div>
          <p className="text-[0.75rem] font-medium text-muted-foreground">Folder</p>
          <span className={cn(box, "border-input")}>Mobile bookmarks</span>
        </div>
      </div>
    </div>
  );
}

function AddressSuggestions() {
  return (
    <div className="guide-fade absolute inset-x-0 bottom-0 top-[6.1rem] z-20 bg-surface">
      <span data-target="suggest-bookmark" className="flex items-center gap-[0.9rem] border-b border-border px-[1rem] py-[0.75rem]">
        <Star className={cn(ico, "fill-[#e0a020] text-[#e0a020]")} />
        <span className="min-w-0">
          <span className="block text-[0.9rem] font-semibold">{BOOKMARK_NAME}</span>
          <span className="block truncate font-mono text-[0.72rem] text-muted-foreground">javascript:(()=&gt;&#123;const p=…</span>
        </span>
      </span>
      {[`${BOOKMARK_NAME}`, `${BOOKMARK_NAME} meaning`].map((s) => (
        <span key={s} className="flex items-center gap-[0.9rem] px-[1rem] py-[0.75rem] text-[0.9rem]">
          <Search className={cn(ico, "text-muted-foreground")} />
          {s}
        </span>
      ))}
    </div>
  );
}

function AndroidBrowser({ view }: { view: View }) {
  const typingBookmark = hasFlag(view, "typing-bookmark");
  const typing = hasFlag(view, "typing") || typingBookmark;
  return (
    <div className="relative flex h-full flex-col">
      <StatusBar os="android" />
      <div className="relative z-20 flex h-[3.5rem] shrink-0 items-center gap-[0.5rem] border-b border-border bg-surface px-[0.6rem]">
        <span
          data-target="address"
          className={cn(
            "flex h-[2.5rem] min-w-0 flex-1 items-center gap-[0.5rem] rounded-full bg-muted px-[0.9rem] text-[0.88rem]",
            typing && "ring-2 ring-primary",
          )}
        >
          {view.url && !typing ? <Lock className="h-[0.85rem] w-[0.85rem] shrink-0 text-muted-foreground" /> : <Search className="h-[0.9rem] w-[0.9rem] shrink-0 text-muted-foreground" />}
          <AddressText view={view} placeholder="Search or type web address" typed={typingBookmark ? BOOKMARK_NAME : undefined} />
        </span>
        <span className="grid h-[1.4rem] w-[1.4rem] shrink-0 place-items-center rounded-[0.35rem] border-2 border-foreground text-[0.65rem] font-bold">1</span>
        <span data-target="menu" className="grid h-[2.2rem] w-[2.2rem] shrink-0 place-items-center rounded-full">
          <EllipsisVertical className="h-[1.3rem] w-[1.3rem]" />
        </span>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <MockPage key={view.page} page={view.page} view={view} size="phone" />
      </div>
      {view.overlay === "chrome-menu" ? <ChromeMenu /> : null}
      {view.overlay === "chrome-install" ? <ChromeInstallDialog /> : null}
      {view.overlay === "bookmark-saved" ? <BookmarkSnackbar /> : null}
      {view.overlay === "bookmark-edit" ? <BookmarkEditor view={view} /> : null}
      {view.overlay === "address-suggest" ? <AddressSuggestions /> : null}
      {typing ? <Keyboard os="android" /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// iPhone: Safari
// ---------------------------------------------------------------------------

function SafariMoreMenu() {
  const rows: { label: string; Icon: typeof Plus; target?: string }[] = [
    { label: "Share", Icon: Share, target: "share" },
    { label: "Add to Favorites", Icon: Star },
    { label: "Add Bookmark", Icon: Bookmark },
    { label: "Bookmarks", Icon: BookOpen },
    { label: "Find on Page", Icon: Search },
    { label: "New Tab", Icon: Plus },
  ];
  return (
    <div className="guide-pop absolute bottom-[5.6rem] right-[0.8rem] z-30 w-[14rem] origin-bottom-right overflow-hidden rounded-[1.1rem] bg-surface/95 text-[0.92rem] shadow-pop ring-1 ring-border backdrop-blur">
      {rows.map(({ label, Icon, target }, i) => (
        <span key={label} data-target={target} className={cn("flex items-center justify-between px-[1rem] py-[0.7rem]", i > 0 && "border-t border-border")}>
          {label}
          <Icon className={cn(ico, "text-foreground")} />
        </span>
      ))}
    </div>
  );
}

function SafariShareSheet() {
  const apps = [
    { label: "Messages", bg: "bg-[#34c759]", Icon: MessageCircle },
    { label: "Mail", bg: "bg-[#2f7cf6]", Icon: Mail },
    { label: "Notes", bg: "bg-[#f5c400]", Icon: Copy },
    { label: "More", bg: "bg-muted", Icon: Ellipsis },
  ];
  const actions: { label: string; Icon: typeof Plus; target?: string }[] = [
    { label: "Copy", Icon: Copy },
    { label: "Add to Reading List", Icon: BookOpen },
    { label: "Add Bookmark", Icon: Bookmark },
    { label: "Add to Home Screen", Icon: SquarePlus, target: "add-home" },
    { label: "Find on Page", Icon: Search },
  ];
  return (
    <Scrim>
      <div className="guide-sheet absolute inset-x-0 bottom-0 top-[9rem] rounded-t-[1.6rem] bg-surface-2 px-[1rem] pt-[1rem]">
        <div className="flex items-center gap-[0.7rem]">
          <Logo className="h-[2.6rem] w-[2.6rem]" />
          <div className="min-w-0 flex-1">
            <p className="text-[0.9rem] font-semibold">Unified Student Portal</p>
            <p className="truncate text-[0.75rem] text-muted-foreground">{PORTAL_HOST}</p>
          </div>
          <span className="grid h-[1.9rem] w-[1.9rem] place-items-center rounded-full bg-muted">
            <X className="h-[1rem] w-[1rem]" />
          </span>
        </div>
        <div className="mt-[1.1rem] flex justify-between px-[0.4rem]">
          {apps.map(({ label, bg, Icon }) => (
            <span key={label} className="flex flex-col items-center gap-[0.35rem] text-[0.7rem]">
              <span className={cn("grid h-[3.2rem] w-[3.2rem] place-items-center rounded-[0.9rem] text-white", bg)}>
                <Icon className="h-[1.4rem] w-[1.4rem]" />
              </span>
              {label}
            </span>
          ))}
        </div>
        <div className="mt-[1.1rem] overflow-hidden rounded-[0.9rem] bg-surface text-[0.92rem]">
          {actions.map(({ label, Icon, target }, i) => (
            <span key={label} data-target={target} className={cn("flex items-center justify-between px-[1rem] py-[0.75rem]", i > 0 && "border-t border-border")}>
              {label}
              <Icon className={ico} />
            </span>
          ))}
        </div>
      </div>
    </Scrim>
  );
}

function SafariAddSheet() {
  return (
    <Scrim>
      <div className="guide-sheet absolute inset-x-0 bottom-0 top-[3.4rem] rounded-t-[1.6rem] bg-surface-2">
        <div className="flex items-center justify-between px-[1rem] py-[1rem] text-[0.92rem]">
          <span className="text-primary">Cancel</span>
          <span className="font-semibold">Add to Home Screen</span>
          <span data-target="add-confirm" className="rounded-[0.5rem] px-[0.4rem] py-[0.1rem] font-semibold text-primary">
            Add
          </span>
        </div>
        <div className="mx-[1rem] flex items-center gap-[0.8rem] rounded-[0.9rem] bg-surface p-[0.8rem]">
          <Logo className="h-[3.6rem] w-[3.6rem] shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="border-b border-border pb-[0.4rem] text-[0.95rem]">Portal</p>
            <p className="truncate pt-[0.4rem] text-[0.78rem] text-muted-foreground">{PORTAL_HOST}</p>
          </div>
        </div>
        <div className="mx-[1rem] mt-[0.9rem] flex items-center justify-between rounded-[0.9rem] bg-surface px-[1rem] py-[0.75rem] text-[0.92rem]">
          Open as Web App
          <span className="relative h-[1.6rem] w-[2.7rem] rounded-full bg-[#34c759]">
            <span className="absolute right-[0.15rem] top-[0.15rem] h-[1.3rem] w-[1.3rem] rounded-full bg-white shadow" />
          </span>
        </div>
        <p className="mx-[1.2rem] mt-[0.6rem] text-[0.75rem] leading-snug text-muted-foreground">
          An icon will be added to your Home Screen so you can quickly open this website.
        </p>
      </div>
    </Scrim>
  );
}

function IosBrowser({ view }: { view: View }) {
  const typing = hasFlag(view, "typing");
  return (
    <div className="relative flex h-full flex-col bg-background">
      <StatusBar os="ios" tone={view.page === "portal-welcome" ? "surface" : "clear"} />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <MockPage key={view.page} page={view.page} view={view} size="phone" />
      </div>
      {/* Compact bottom bar: back, address, more. */}
      <div className={cn("absolute inset-x-0 z-20 flex items-center gap-[0.5rem] px-[0.8rem] transition-[bottom]", typing ? "bottom-[14.2rem]" : "bottom-[1.6rem]")}>
        <span className="grid h-[2.8rem] w-[2.8rem] shrink-0 place-items-center rounded-full bg-surface/90 shadow-pop ring-1 ring-border backdrop-blur">
          <ChevronLeft className="h-[1.3rem] w-[1.3rem]" />
        </span>
        <span
          data-target="address"
          className={cn(
            "flex h-[2.8rem] min-w-0 flex-1 items-center justify-center gap-[0.4rem] rounded-full bg-surface/90 px-[1rem] text-[0.88rem] shadow-pop ring-1 ring-border backdrop-blur",
            typing && "justify-start ring-2 ring-primary",
          )}
        >
          {view.url && !typing ? <Lock className="h-[0.8rem] w-[0.8rem] shrink-0 text-muted-foreground" /> : null}
          <AddressText view={view} placeholder="Search or enter website" />
        </span>
        <span data-target="more" className="grid h-[2.8rem] w-[2.8rem] shrink-0 place-items-center rounded-full bg-surface/90 shadow-pop ring-1 ring-border backdrop-blur">
          <Ellipsis className="h-[1.3rem] w-[1.3rem]" />
        </span>
      </div>
      {view.overlay === "safari-more" ? <SafariMoreMenu /> : null}
      {view.overlay === "safari-share" ? <SafariShareSheet /> : null}
      {view.overlay === "safari-add" ? <SafariAddSheet /> : null}
      {typing ? <Keyboard os="ios" /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Home screens and the installed app
// ---------------------------------------------------------------------------

const HOME_APPS = [
  { label: "Phone", Icon: Phone, bg: "bg-[#2e7d5b]" },
  { label: "Messages", Icon: MessageCircle, bg: "bg-[#3a78d8]" },
  { label: "Camera", Icon: Camera, bg: "bg-[#5a6470]" },
  { label: "Photos", Icon: ImageIcon, bg: "bg-[#d0613c]" },
  { label: "Clock", Icon: Clock, bg: "bg-[#33393f]" },
  { label: "Calculator", Icon: Calculator, bg: "bg-[#7a5bc4]" },
  { label: "Music", Icon: Music, bg: "bg-[#c43d6b]" },
  { label: "Mail", Icon: Mail, bg: "bg-[#2f7cf6]" },
  { label: "Browser", Icon: Globe, bg: "bg-[#1f8fa8]" },
  { label: "Settings", Icon: Settings, bg: "bg-[#6b7280]" },
];

function HomeScreen({ view, os }: { view: View; os: "android" | "ios" }) {
  const isNew = hasFlag(view, "new-icon");
  const shape = os === "ios" ? "rounded-[0.95rem]" : "rounded-full";
  return (
    <div className="relative flex h-full flex-col bg-[linear-gradient(160deg,#1d5c50_0%,#0f2f2a_55%,#091c19_100%)] text-white">
      <StatusBar os={os} tone="light" />
      {os === "android" ? (
        <div className="px-[1.5rem] pt-[1.2rem]">
          <p className="font-display text-[2.6rem] font-semibold leading-none tabular-nums">9:41</p>
          <p className="mt-[0.3rem] text-[0.85rem] opacity-85">Monday, 12 October</p>
        </div>
      ) : null}
      <div className={cn("grid grid-cols-4 gap-x-[0.9rem] gap-y-[1.2rem] px-[1.3rem]", os === "android" ? "pt-[2rem]" : "pt-[1.6rem]")}>
        {HOME_APPS.map(({ label, Icon, bg }) => (
          <span key={label} className="flex flex-col items-center gap-[0.35rem] text-[0.7rem]">
            <span className={cn("grid h-[3.4rem] w-[3.4rem] place-items-center", shape, bg)}>
              <Icon className="h-[1.5rem] w-[1.5rem]" />
            </span>
            {label}
          </span>
        ))}
        {isNew ? (
          <span data-target="app-icon" className="guide-drop flex flex-col items-center gap-[0.35rem] text-[0.7rem] font-semibold">
            <span className={cn("grid h-[3.4rem] w-[3.4rem] place-items-center overflow-hidden bg-[#13483f] ring-2 ring-[#e0a020]/70", shape)}>
              <Logo className="h-[3.4rem] w-[3.4rem]" />
            </span>
            Portal
          </span>
        ) : null}
      </div>
      {isNew && os === "android" ? (
        <div className="guide-rise absolute inset-x-[1rem] bottom-[7.5rem] rounded-[0.7rem] bg-[#e8f1ee] px-[1rem] py-[0.7rem] text-[0.8rem] font-medium text-[#0f2f2a] [animation-delay:0.4s]">
          Portal was added to your Home screen
        </div>
      ) : null}
      <div className="absolute inset-x-[1rem] bottom-[1.6rem]">
        {os === "android" ? (
          <span className="flex h-[3rem] items-center gap-[0.7rem] rounded-full bg-white/90 px-[1.1rem] text-[0.85rem] text-[#3b4744]">
            <Search className="h-[1.1rem] w-[1.1rem]" />
            Search
          </span>
        ) : (
          <span className="flex justify-around rounded-[1.8rem] bg-white/20 px-[0.6rem] py-[0.7rem] backdrop-blur">
            {HOME_APPS.slice(0, 4).map(({ label, Icon, bg }) => (
              <span key={label} className={cn("grid h-[3.4rem] w-[3.4rem] place-items-center", shape, bg)}>
                <Icon className="h-[1.5rem] w-[1.5rem]" />
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

/** The installed app: a splash with the icon, then the portal with no browser bars. */
function PhoneApp({ view, os }: { view: View; os: "android" | "ios" }) {
  return (
    <div className="guide-launch relative flex h-full flex-col bg-background">
      <StatusBar os={os} tone={view.page === "portal-welcome" ? "surface" : "clear"} />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <MockPage page={view.page === "new-tab" ? "portal-welcome" : view.page} view={view} size="phone" />
      </div>
      <div className="guide-splash absolute inset-0 z-30 flex flex-col items-center justify-center gap-[1rem] bg-[#f3f6f4] dark:bg-[#0b1513]">
        <Logo className="h-[5rem] w-[5rem]" />
        <span className="font-display text-[1.1rem] font-semibold text-[#13483f] dark:text-[#7fd1b5]">Portal</span>
      </div>
    </div>
  );
}

export function PhoneScreen({ view, os }: { view: View; os: "android" | "ios" }) {
  switch (view.screen) {
    case "android-browser":
      return <AndroidBrowser view={view} />;
    case "ios-browser":
      return <IosBrowser view={view} />;
    case "android-home":
      return <HomeScreen view={view} os="android" />;
    case "ios-home":
      return <HomeScreen view={view} os="ios" />;
    case "phone-app":
      return <PhoneApp view={view} os={os} />;
    default:
      return null;
  }
}
