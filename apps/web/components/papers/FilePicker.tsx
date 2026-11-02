"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Camera, FileText, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { formatSize, isPdf, mergeFiles, moveFile } from "./file-merge";

/** A small preview of one photo. The object URL is set and released in an effect, so nothing leaks. */
function Thumb({ file }: { file: File }) {
  const ref = React.useRef<HTMLImageElement>(null);
  React.useEffect(() => {
    const img = ref.current;
    if (!img) return;
    const url = URL.createObjectURL(file);
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  // eslint-disable-next-line @next/next/no-img-element -- a local preview of a file the person just picked
  return <img ref={ref} alt="" className="h-12 w-12 shrink-0 rounded-md bg-muted object-cover" />;
}

/**
 * Pick, drop or photograph the file to share: one PDF, or a photo of each page. Photos can be
 * reordered, since they become the pages of one PDF in this order.
 */
export function FilePicker({
  id,
  files,
  onChange,
  describedBy,
}: {
  id: string;
  files: File[];
  onChange: (files: File[]) => void;
  describedBy?: string;
}) {
  const fileInput = React.useRef<HTMLInputElement>(null);
  const cameraInput = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [announce, setAnnounce] = React.useState("");

  const add = (incoming: File[]) => {
    if (incoming.length === 0) return;
    const result = mergeFiles(files, incoming);
    setNote(result.note);
    setAnnounce(
      result.files.length === 0
        ? "No files added."
        : result.files.length === 1 && isPdf(result.files[0]!)
          ? `${result.files[0]!.name} added.`
          : `${result.files.length} ${result.files.length === 1 ? "page" : "pages"} ready.`,
    );
    onChange(result.files);
  };

  const remove = (index: number) => {
    setNote(null);
    onChange(files.filter((_, i) => i !== index));
  };

  const hasFiles = files.length > 0;
  const pdf = hasFiles && isPdf(files[0]!);
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <div className="grid gap-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          "rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
          dragging ? "border-primary bg-primary/8" : "border-border bg-surface/60",
        )}
      >
        {/* The real input stays in the page (label click, keyboard, screen readers); the buttons below drive it. */}
        <input
          ref={fileInput}
          id={id}
          type="file"
          accept="application/pdf,image/*"
          multiple
          aria-describedby={describedBy}
          className="sr-only"
          onChange={(e) => {
            add(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          tabIndex={-1}
          aria-hidden
          className="sr-only"
          onChange={(e) => {
            add(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <Upload className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden />
        <p className="mt-2 text-body font-medium text-foreground">
          {hasFiles ? (pdf ? "Choose a different PDF" : "Add more pages") : "Add a PDF, or a photo of each page"}
        </p>
        <p className="text-small text-muted-foreground">Drag files here, or</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => fileInput.current?.click()}>
            <Upload className="h-4 w-4" aria-hidden />
            Choose files
          </Button>
          {/* Only on touch devices: a laptop has no rear camera to open. */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="hidden [@media(pointer:coarse)]:inline-flex"
            onClick={() => cameraInput.current?.click()}
          >
            <Camera className="h-4 w-4" aria-hidden />
            Take a photo
          </Button>
        </div>
      </div>

      {hasFiles ? (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border" aria-label="Files to share">
            {files.map((file, i) => (
              <li key={`${file.name}-${file.size}-${file.lastModified}-${i}`} className="flex items-center gap-3 bg-surface/60 p-2">
                {pdf ? (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <FileText className="h-5 w-5" aria-hidden />
                  </span>
                ) : (
                  <Thumb file={file} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-small font-medium text-foreground">{file.name}</p>
                  <p className="text-small text-muted-foreground">
                    {pdf ? "PDF" : `Page ${i + 1}`} · {formatSize(file.size)}
                  </p>
                </div>
                {!pdf && files.length > 1 ? (
                  <div className="flex shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Move page ${i + 1} up`}
                      disabled={i === 0}
                      onClick={() => onChange(moveFile(files, i, i - 1))}
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Move page ${i + 1} down`}
                      disabled={i === files.length - 1}
                      onClick={() => onChange(moveFile(files, i, i + 1))}
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                ) : null}
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${file.name}`} onClick={() => remove(i)}>
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-small text-muted-foreground">
            {pdf
              ? `1 PDF, ${formatSize(totalBytes)}.`
              : `${files.length} ${files.length === 1 ? "photo" : "photos"}, ${formatSize(totalBytes)}. They are joined into one PDF in this order.`}
          </p>
        </>
      ) : null}

      {note ? (
        <p role="status" className="text-small text-warning">
          {note}
        </p>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
