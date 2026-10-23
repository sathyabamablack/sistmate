import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading course">
      <Skeleton className="mb-3 h-4 w-28" />
      <Skeleton className="h-9 w-2/3 max-w-md" />
      <Skeleton className="mt-3 h-5 w-80 max-w-full" />
      <div className="mt-4 flex gap-10">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-24" />
      </div>
      <div className="mt-8 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
        <div className="mb-6 flex gap-2 overflow-hidden lg:mb-0 lg:block lg:space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-32 shrink-0 rounded-full lg:w-full lg:rounded-lg" />
          ))}
        </div>
        <div className="min-w-0 space-y-10">
          <Skeleton className="h-10 w-full max-w-sm" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
