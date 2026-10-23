import { cn } from "@/lib/utils";

/** Square type tag in front of a file ("PDF", "PPT", "DOC"). Text, so it reads without colour. */
export function FileTypeTile({ type, className }: { type: string; className?: string }) {
  const label = type.length > 5 ? type.slice(0, 4) : type;
  return (
    <span
      className={cn(
        "grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent text-micro font-semibold tracking-wide text-accent-foreground",
        className,
      )}
    >
      {label}
    </span>
  );
}
