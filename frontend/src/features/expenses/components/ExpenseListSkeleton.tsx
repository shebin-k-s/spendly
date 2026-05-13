export default function ExpenseListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-16 bg-card rounded-2xl animate-pulse border border-border" />
      ))}
    </div>
  );
}
