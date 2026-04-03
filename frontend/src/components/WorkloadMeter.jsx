const FORECAST = [
  { max: 25, label: 'Light',       color: 'text-emerald-400' },
  { max: 38, label: 'Balanced',    color: 'text-byu-light'   },
  { max: 50, label: 'Challenging', color: 'text-amber-400'   },
  { max: Infinity, label: 'Heavy', color: 'text-rose-400'    },
]

export function WorkloadMeter({ credits, workloadHours }) {
  const intensity = Math.min(100, Math.round((workloadHours / 65) * 100))
  const forecast = FORECAST.find(f => workloadHours < f.max) ?? FORECAST[FORECAST.length - 1]

  return (
    <div className="rounded-2xl border border-border bg-card/70 p-4 backdrop-blur-sm">
      <div className="mb-2 flex items-end justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">Estimated Weekly Load</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-semibold text-foreground">{workloadHours} hrs</p>
            {workloadHours > 0 && (
              <span className={`font-mono text-sm font-semibold ${forecast.color}`}>{forecast.label}</span>
            )}
          </div>
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
        Estimated using classroom time, course level, and RMP difficulty rating.
      </p>
    </div>
  )
}
