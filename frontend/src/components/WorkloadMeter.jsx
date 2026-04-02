export function WorkloadMeter({ credits, workloadHours }) {
  const intensity = Math.min(100, Math.round((workloadHours / 55) * 100))

  return (
    <div className="rounded-2xl border border-border bg-card/70 p-4 backdrop-blur-sm">
      <div className="mb-2 flex items-end justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">Estimated Weekly Load</p>
          <p className="text-2xl font-semibold text-foreground">{workloadHours} hrs</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Total credits</p>
          <p className="font-mono text-xl text-byu-light">{credits}</p>
        </div>
      </div>

      <div className="h-3 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-gradient-to-r from-byu-royal via-byu-blue to-byu-light transition-[width] duration-300"
          style={{ width: `${Math.max(5, intensity)}%` }}
        />
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        Workload is estimated using data from Rate My Professor and credit count for each course.
      </p>
    </div>
  )
}
