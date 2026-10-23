"use client";

import * as React from "react";
import { ChevronDown, Download, ExternalLink } from "lucide-react";
import type { Notification } from "@usp/core";
import { Badge } from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  describeLink,
  formatPosted,
  formatStamp,
  linkify,
  type NoticeGroupKey,
} from "@/lib/notice-format";
import { Linkified } from "./Linkified";

const SOURCE_LABEL = { erp: "ERP", lms: "LMS" } as const;

interface Props {
  notice: Notification;
  group: NoticeGroupKey;
  now: Date;
  unread: boolean;
  open: boolean;
  onToggle: () => void;
}

export function NoticeRow({ notice, group, now, unread, open, onToggle }: Props) {
  const [imageFailed, setImageFailed] = React.useState(false);
  const panelId = `notice-${notice.id}`;
  const image = notice.imageUrl && !imageFailed ? notice.imageUrl : undefined;
  const preview = notice.body?.replace(/\s*\n\s*/g, " ") ?? "";
  const link = notice.url ? describeLink(notice.url) : undefined;
  const linkInBody =
    !!notice.url &&
    linkify(`${notice.title}\n${notice.body ?? ""}`).some(
      (s) => s.type === "link" && s.href === notice.url,
    );
  const titleHasLink = linkify(notice.title).some((s) => s.type === "link");
  const lines = notice.body ? notice.body.split("\n") : [];

  return (
    <li className="relative">
      {/* Edge bar is decoration; the "Unread" badge carries the meaning. */}
      {unread ? (
        <span className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden />
      ) : null}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-11 w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2 focusable focus-visible:ring-inset focus-visible:ring-offset-0 sm:gap-4 sm:px-5"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-muted-foreground">
            {unread ? <Badge variant="primary">Unread</Badge> : null}
            <Badge variant="muted">{SOURCE_LABEL[notice.source]}</Badge>
            <time dateTime={notice.date} className="tabular-nums">
              {formatStamp(notice.date, group)}
            </time>
          </span>
          <span
            data-notice-title
            className={cn(
              "mt-1.5 block text-body text-foreground",
              unread ? "font-semibold" : "font-medium",
              !open && "line-clamp-2",
            )}
          >
            {notice.title}
          </span>
          {!open && preview ? (
            <span className="mt-1 line-clamp-2 block text-small text-muted-foreground">{preview}</span>
          ) : null}
          {!open && !preview && image && notice.title === "Notice (poster)" ? (
            <span className="mt-1 block text-small text-muted-foreground">Poster only</span>
          ) : null}
        </span>

        {image && !open ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote S3 poster; sizes unknown, next/image would need a host allowlist
          <img
            src={image}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
            className="mt-0.5 h-14 w-14 shrink-0 rounded-lg bg-muted object-cover sm:h-16 sm:w-20"
          />
        ) : null}
        <ChevronDown
          className={cn(
            "mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label={notice.title}
          className="animate-fade-in px-4 pb-5 pt-1 sm:px-5"
        >
          <div className="max-w-prose space-y-3">
            <p className="text-small text-muted-foreground">
              {formatPosted(notice.date, now)} · {SOURCE_LABEL[notice.source]}
            </p>

            {image ? (
              // eslint-disable-next-line @next/next/no-img-element -- see above
              <img
                src={image}
                alt="Image attached to this notice"
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={() => setImageFailed(true)}
                className="max-h-[32rem] w-auto max-w-full rounded-lg bg-muted"
              />
            ) : null}

            <div className="space-y-2 text-body text-foreground">
              {titleHasLink ? (
                <p className="font-medium">
                  <Linkified text={notice.title} />
                </p>
              ) : null}
              {lines.map((line, i) => (
                <p key={i}>
                  <Linkified text={line} />
                </p>
              ))}
            </div>

            {notice.url && link && (link.isFile || !linkInBody) ? (
              <a
                href={notice.url}
                target="_blank"
                rel="noopener noreferrer"
                {...(link.isFile ? { download: "" } : {})}
                className={buttonClass("outline", "md", "max-w-full")}
              >
                {link.isFile ? (
                  <Download className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                ) : (
                  <ExternalLink className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                )}
                <span className="truncate">
                  {link.isFile ? (link.fileName ?? "Download attachment") : `Open page on ${link.host}`}
                </span>
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}
