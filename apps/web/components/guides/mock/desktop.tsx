import * as React from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Download,
  EllipsisVertical,
  FileArchive,
  Folder,
  FolderOpen,
  Globe,
  HardDrive,
  House,
  Lock,
  Minus,
  MonitorDown,
  Plus,
  Puzzle,
  RotateCw,
  Search,
  Square,
  Star,
  X,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { PORTAL_HOST, type View } from "@/lib/guides";
import { cn } from "@/lib/utils";
import { hasFlag, MockPage, pageTitle } from "./pages";
import { AddressText } from "./phone";

const ico = "h-[1rem] w-[1rem]";
const WALLPAPER = "bg-[linear-gradient(150deg,#2a6f61_0%,#134038_50%,#0b231f_100%)]";

function WindowControls({ light }: { light?: boolean }) {
  return (
    <span className={cn("flex items-center gap-[1.1rem] px-[0.9rem]", light ? "text-white/85" : "text-muted-foreground")}>
      <Minus className="h-[0.9rem] w-[0.9rem]" />
      <Square className="h-[0.75rem] w-[0.75rem]" />
      <X className="h-[0.9rem] w-[0.9rem]" />
    </span>
  );
}

function Favicon({ page }: { page: View["page"] }) {
  if (page === "extensions") return <Puzzle className="h-[0.9rem] w-[0.9rem] shrink-0" />;
  if (page === "new-tab" || page === "erp-login") return <Globe className="h-[0.9rem] w-[0.9rem] shrink-0" />;
  return <Logo className="h-[0.95rem] w-[0.95rem] shrink-0" />;
}

function DesktopInstallPopup() {
  return (
    <div className="guide-pop absolute right-[7.2rem] top-[5.2rem] z-30 w-[21rem] origin-top-right rounded-[0.8rem] bg-surface p-[1.1rem] shadow-pop ring-1 ring-border">
      <p className="text-[1rem] font-semibold">Install app</p>
      <div className="mt-[0.8rem] flex items-center gap-[0.75rem]">
        <Logo className="h-[2.5rem] w-[2.5rem] shrink-0" />
        <div className="min-w-0">
          <p className="text-[0.85rem] font-semibold">Unified Student Portal</p>
          <p className="truncate text-[0.75rem] text-muted-foreground">{PORTAL_HOST}</p>
        </div>
      </div>
      <div className="mt-[1rem] flex justify-end gap-[0.5rem] text-[0.8rem] font-semibold">
        <span data-target="install-confirm" className="rounded-full bg-[#1a73e8] px-[1.1rem] py-[0.45rem] text-white">
          Install
        </span>
        <span className="rounded-full border border-input px-[1rem] py-[0.45rem] text-[#1a73e8] dark:text-[#8ab4f8]">Cancel</span>
      </div>
    </div>
  );
}

function DownloadBubble() {
  return (
    <div className="guide-pop absolute right-[5.6rem] top-[5.2rem] z-30 w-[19rem] origin-top-right rounded-[0.8rem] bg-surface p-[0.6rem] shadow-pop ring-1 ring-border">
      <p className="px-[0.5rem] py-[0.3rem] text-[0.8rem] font-semibold">Recent downloads</p>
      <span data-target="download-file" className="flex items-center gap-[0.7rem] rounded-[0.5rem] px-[0.5rem] py-[0.5rem]">
        <FileArchive className="h-[1.6rem] w-[1.6rem] shrink-0 text-[#e0a020]" />
        <span className="min-w-0">
          <span className="block text-[0.82rem] font-medium">erp-connector.zip</span>
          <span className="block text-[0.72rem] text-muted-foreground">24 KB · Done</span>
        </span>
        <FolderOpen className="ml-auto h-[1rem] w-[1rem] text-muted-foreground" />
      </span>
    </div>
  );
}

function FolderPicker({ view }: { view: View }) {
  const picked = hasFlag(view, "folder-picked");
  return (
    <div className="guide-fade absolute inset-0 z-30 bg-black/35">
      <div className="guide-pop absolute inset-x-0 top-[5.5rem] mx-auto w-[34rem] overflow-hidden rounded-[0.7rem] bg-surface shadow-pop ring-1 ring-border">
        <div className="flex items-center justify-between border-b border-border px-[1rem] py-[0.6rem] text-[0.85rem] font-semibold">
          Select the extension directory
          <X className="h-[0.9rem] w-[0.9rem] text-muted-foreground" />
        </div>
        <div className="flex items-center gap-[0.4rem] border-b border-border px-[1rem] py-[0.5rem] text-[0.75rem] text-muted-foreground">
          <HardDrive className="h-[0.85rem] w-[0.85rem]" />
          This PC <ChevronRight className="h-[0.75rem] w-[0.75rem]" /> Downloads
        </div>
        <div className="grid grid-cols-[9rem_1fr]">
          <ul className="space-y-[0.15rem] border-r border-border p-[0.5rem] text-[0.78rem] text-muted-foreground">
            {["Desktop", "Downloads", "Documents"].map((n) => (
              <li key={n} className={cn("rounded-[0.35rem] px-[0.5rem] py-[0.3rem]", n === "Downloads" && "bg-accent font-medium text-accent-foreground")}>
                {n}
              </li>
            ))}
          </ul>
          <div className="p-[0.5rem] text-[0.82rem]">
            <span
              data-target="pick-folder"
              className={cn("flex items-center gap-[0.6rem] rounded-[0.35rem] px-[0.5rem] py-[0.4rem]", picked && "bg-[#1a73e8]/15 ring-1 ring-[#1a73e8]/50")}
            >
              <Folder className="h-[1.1rem] w-[1.1rem] fill-[#e0a020]/80 text-[#b07a10]" />
              erp-connector
            </span>
            <span className="flex items-center gap-[0.6rem] px-[0.5rem] py-[0.4rem] text-muted-foreground">
              <FileArchive className="h-[1.1rem] w-[1.1rem]" />
              erp-connector.zip
            </span>
          </div>
        </div>
        <div className="flex items-center gap-[0.6rem] border-t border-border bg-surface-2 px-[1rem] py-[0.7rem] text-[0.78rem]">
          <span className="text-muted-foreground">Folder:</span>
          <span className="flex h-[1.8rem] flex-1 items-center rounded-[0.3rem] border border-input bg-surface px-[0.5rem]">
            {picked ? "erp-connector" : ""}
          </span>
          <span data-target="select-folder" className={cn("rounded-[0.35rem] px-[0.9rem] py-[0.35rem] font-semibold", picked ? "bg-[#1a73e8] text-white" : "bg-muted text-muted-foreground")}>
            Select Folder
          </span>
          <span className="rounded-[0.35rem] border border-input px-[0.9rem] py-[0.35rem]">Cancel</span>
        </div>
      </div>
    </div>
  );
}

function DesktopBrowser({ view }: { view: View }) {
  const typing = hasFlag(view, "typing");
  const isPortal = view.page.startsWith("portal");
  const downloaded = hasFlag(view, "downloaded");
  return (
    <div className="relative flex h-full flex-col bg-surface">
      {/* Tab strip */}
      <div className="flex h-[2.5rem] shrink-0 items-end bg-muted pl-[0.6rem]">
        <span className="flex h-[2.1rem] w-[15rem] items-center gap-[0.5rem] rounded-t-[0.6rem] bg-surface px-[0.8rem] text-[0.78rem]">
          <Favicon page={view.page} />
          <span className="min-w-0 flex-1 truncate">{pageTitle(view.page)}</span>
          <X className="h-[0.8rem] w-[0.8rem] text-muted-foreground" />
        </span>
        <Plus className="mb-[0.55rem] ml-[0.6rem] h-[1rem] w-[1rem] text-muted-foreground" />
        <span className="ml-auto self-center">
          <WindowControls />
        </span>
      </div>
      {/* Toolbar */}
      <div className="flex h-[2.9rem] shrink-0 items-center gap-[0.9rem] border-b border-border px-[0.8rem] text-muted-foreground">
        <ArrowLeft className={ico} />
        <ArrowRight className={ico} />
        <RotateCw className={ico} />
        <span
          data-target="address"
          className={cn(
            "flex h-[2.1rem] min-w-0 flex-1 items-center gap-[0.55rem] rounded-full bg-muted px-[0.9rem] text-[0.82rem]",
            typing && "bg-surface ring-2 ring-[#1a73e8]",
          )}
        >
          {view.url && !typing ? <Lock className="h-[0.8rem] w-[0.8rem] shrink-0" /> : <Search className="h-[0.85rem] w-[0.85rem] shrink-0" />}
          <span className="flex min-w-0 flex-1">
            <AddressText view={view} placeholder="Search Google or type a URL" />
          </span>
          {isPortal && !typing ? (
            <span data-target="install-icon" className="grid h-[1.6rem] w-[1.6rem] shrink-0 place-items-center rounded-full text-foreground">
              <MonitorDown className="h-[1rem] w-[1rem]" />
            </span>
          ) : null}
          <Star className="h-[0.95rem] w-[0.95rem] shrink-0" />
        </span>
        {downloaded ? (
          <span className="grid h-[1.6rem] w-[1.6rem] place-items-center rounded-full bg-[#1a73e8]/15 text-[#1a73e8] dark:text-[#8ab4f8]">
            <Download className={ico} />
          </span>
        ) : null}
        <Puzzle className={ico} />
        <span className="grid h-[1.5rem] w-[1.5rem] place-items-center rounded-full bg-accent text-[0.6rem] font-semibold text-accent-foreground">AS</span>
        <EllipsisVertical className={ico} />
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <MockPage key={view.page} page={view.page} view={view} size="desktop" />
      </div>
      {view.overlay === "desktop-install" ? <DesktopInstallPopup /> : null}
      {view.overlay === "download-bubble" ? <DownloadBubble /> : null}
      {view.overlay === "folder-picker" ? <FolderPicker view={view} /> : null}
    </div>
  );
}

function Taskbar({ withPortal }: { withPortal?: boolean }) {
  return (
    <div className="absolute inset-x-0 bottom-0 flex h-[2.6rem] items-center justify-center gap-[0.8rem] bg-black/35 backdrop-blur">
      <House className="h-[1.1rem] w-[1.1rem] text-white/85" />
      <Globe className="h-[1.1rem] w-[1.1rem] text-white/85" />
      <Folder className="h-[1.1rem] w-[1.1rem] text-white/85" />
      {withPortal ? (
        <span className="guide-drop rounded-[0.35rem] border-b-2 border-[#e0a020] pb-[0.1rem]">
          <Logo className="h-[1.4rem] w-[1.4rem]" />
        </span>
      ) : null}
    </div>
  );
}

/** The installed app: its own window, no tabs or address bar. */
function DesktopApp({ view }: { view: View }) {
  return (
    <div className={cn("relative h-full", WALLPAPER)}>
      <div className="guide-launch absolute inset-x-[2rem] bottom-[3.4rem] top-[1rem] flex flex-col overflow-hidden rounded-[0.6rem] bg-surface shadow-pop ring-1 ring-black/30">
        <div className="flex h-[2.2rem] shrink-0 items-center bg-[#13483f] pl-[0.8rem] text-[0.78rem] font-medium text-white">
          <Logo className="h-[1rem] w-[1rem]" />
          <span className="ml-[0.5rem]">Unified Student Portal</span>
          <span className="ml-auto">
            <WindowControls light />
          </span>
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <MockPage page={view.page} view={view} size="desktop" />
        </div>
      </div>
      <Taskbar withPortal />
    </div>
  );
}

/** A plain file manager showing the download, then the unzipped folder. */
function DesktopFiles({ view }: { view: View }) {
  const extracted = hasFlag(view, "extracted");
  const row = "grid grid-cols-[1fr_9rem_5rem] items-center gap-[1rem] rounded-[0.35rem] px-[0.6rem] py-[0.45rem]";
  return (
    <div className={cn("relative h-full", WALLPAPER)}>
      <div className="guide-pop absolute inset-x-0 top-[3rem] mx-auto flex h-[24rem] w-[42rem] flex-col overflow-hidden rounded-[0.6rem] bg-surface shadow-pop ring-1 ring-black/30">
        <div className="flex h-[2.3rem] shrink-0 items-center border-b border-border pl-[0.9rem] text-[0.8rem] font-medium">
          <Folder className="mr-[0.5rem] h-[0.95rem] w-[0.95rem] fill-[#e0a020]/80 text-[#b07a10]" />
          Downloads
          <span className="ml-auto">
            <WindowControls />
          </span>
        </div>
        <div className="flex items-center gap-[0.6rem] border-b border-border px-[0.9rem] py-[0.5rem] text-[0.78rem]">
          <span data-target="extract" className="flex items-center gap-[0.4rem] rounded-[0.4rem] bg-accent px-[0.8rem] py-[0.35rem] font-semibold text-accent-foreground">
            <FolderOpen className="h-[0.95rem] w-[0.95rem]" />
            Extract all
          </span>
          <span className="px-[0.5rem] text-muted-foreground">New</span>
          <span className="px-[0.5rem] text-muted-foreground">Sort</span>
          <span className="px-[0.5rem] text-muted-foreground">View</span>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[9rem_1fr]">
          <ul className="space-y-[0.15rem] border-r border-border p-[0.5rem] text-[0.78rem] text-muted-foreground">
            {["Home", "Desktop", "Downloads", "Documents", "Pictures"].map((n) => (
              <li key={n} className={cn("rounded-[0.35rem] px-[0.5rem] py-[0.3rem]", n === "Downloads" && "bg-accent font-medium text-accent-foreground")}>
                {n}
              </li>
            ))}
          </ul>
          <div className="p-[0.5rem] text-[0.8rem]">
            <div className={cn(row, "text-[0.72rem] font-medium text-muted-foreground")}>
              <span>Name</span>
              <span>Type</span>
              <span className="text-right">Size</span>
            </div>
            {extracted ? (
              <div className={cn(row, "guide-rise bg-[#1a73e8]/12 ring-1 ring-[#1a73e8]/40")}>
                <span className="flex items-center gap-[0.5rem] font-medium">
                  <Folder className="h-[1.1rem] w-[1.1rem] fill-[#e0a020]/80 text-[#b07a10]" />
                  erp-connector
                  <Check className="h-[0.9rem] w-[0.9rem] text-success" />
                </span>
                <span className="text-muted-foreground">File folder</span>
                <span />
              </div>
            ) : null}
            <div className={cn(row, !extracted && "bg-accent/70")}>
              <span className="flex items-center gap-[0.5rem]">
                <FileArchive className="h-[1.1rem] w-[1.1rem] text-[#b07a10]" />
                erp-connector.zip
              </span>
              <span className="text-muted-foreground">Zip archive</span>
              <span className="text-right tabular-nums text-muted-foreground">24 KB</span>
            </div>
          </div>
        </div>
      </div>
      <Taskbar />
    </div>
  );
}

export function DesktopScreen({ view }: { view: View }) {
  switch (view.screen) {
    case "desktop-browser":
      return <DesktopBrowser view={view} />;
    case "desktop-app":
      return <DesktopApp view={view} />;
    case "desktop-files":
      return <DesktopFiles view={view} />;
    default:
      return null;
  }
}
