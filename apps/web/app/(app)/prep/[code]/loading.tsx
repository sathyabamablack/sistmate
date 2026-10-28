import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading subject">
      <Skeleton className="mb-3 h-4 w-32" />
      <Skeleton className="h-9 w-2/3 max-w-md" />
      <Skeleton className="mt-3 h-5 w-72 max-w-full" />
      <div className="mt-8 grid gap-10 lg:grid-cols-2 lg:gap-12">
        <div className="space-y-10">
          <Skeleton className="h-44 w-full rounded-xl" />
          <div className="space-y-3">
            <Skeleton className="h-6 w-32" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      </div>
    </div>
  );
}
