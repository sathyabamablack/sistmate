import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading courses">
      <Skeleton className="h-9 w-40" />
      <Skeleton className="mb-8 mt-3 h-4 w-64 max-w-full" />
      <Skeleton className="mb-4 h-10 w-full sm:w-72" />
      <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl bg-surface p-4 shadow-rest sm:p-5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="mt-6 h-1.5 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
