export default function ExpenseListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="bg-card rounded-2xl p-3 flex items-center justify-between border border-border">
          <div className="flex items-center gap-3 w-full">
            <div className="w-10 h-10 rounded-xl bg-secondary animate-pulse shrink-0" />
            <div className="flex-1 space-y-2.5 py-1">
              <div className="h-3.5 bg-secondary animate-pulse rounded w-1/3" />
              <div className="h-2.5 bg-secondary/80 animate-pulse rounded w-1/4" />
            </div>
            <div className="flex flex-col items-end space-y-2 py-1">
              <div className="h-3.5 bg-secondary animate-pulse rounded w-16" />
              <div className="h-2.5 bg-secondary/80 animate-pulse rounded w-10" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
