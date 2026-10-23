import type { CourseFile, FileGroup } from "@usp/core";
import { cn } from "@/lib/utils";
import { fileHref, fileTypeLabel, formatDay, formatSize, isViewable } from "./format";

const link =
  "focusable rounded-sm text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary";

/** Files served through the app's own download route. The Moodle token never reaches the page. */
export function FileList({
  files,
  courseId,
  cmid,
  group = "files",
  className,
}: {
  files: CourseFile[];
  courseId: number;
  cmid: number;
  group?: FileGroup;
  className?: string;
}) {
  if (files.length === 0) return null;
  return (
    <ul className={cn("space-y-1", className)}>
      {files.map((f, i) => {
        const meta = [fileTypeLabel(f), formatSize(f.size), f.modified ? `updated ${formatDay(f.modified)}` : ""]
          .filter(Boolean)
          .join(", ");
        const viewable = isViewable(f);
        return (
          <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-body">
            <a
              href={fileHref(courseId, cmid, group, i)}
              className={cn(link, "break-all pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center")}
            >
              {f.name}
            </a>
            <span className="text-small tabular-nums text-muted-foreground">{meta}</span>
            {viewable ? (
              <a
                href={fileHref(courseId, cmid, group, i, true)}
                target="_blank"
                rel="noopener"
                className={cn(link, "text-small pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center")}
              >
                View
              </a>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
