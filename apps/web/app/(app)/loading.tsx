import { Skeleton } from "@/components/ui/Skeleton";

/** Mirrors the page frame: title block, one primary panel, then a two-column body. */
export default function Loading() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-72 max-w-full" />
      </div>
      <Skeleton className="h-36 w-full rounded-xl" />
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-10">
        <div className="space-y-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
