import { BarChart3, BadgeCheck, ExternalLink, Gauge, Star } from 'lucide-react'

function getRmpUrl(rmpId) {
  if (!rmpId) return null
  try {
    const decoded = atob(rmpId) // e.g. "Teacher-2133426"
    const numericId = decoded.replace(/^.*-/, '')
    return `https://www.ratemyprofessors.com/professor/${numericId}`
  } catch {
    return null
  }
}

export function ProfessorCard({ professor, name }) {
  const ratingPct = Math.min(100, (professor.rating / 5) * 100)
  const difficultyPct = Math.min(100, (professor.difficulty / 5) * 100)
  const rmpUrl = getRmpUrl(professor.rmpId)

  return (
    <div className="w-full rounded-xl border border-border/80 bg-card/90 p-4 shadow-sm backdrop-blur-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Professor Insight</p>
          <h4 className="font-mono text-base font-semibold text-foreground">{name || 'Instructor data'}</h4>
        </div>
        <div className="rounded-full border border-byu-royal/30 bg-byu-royal/15 px-2 py-1 text-xs font-semibold text-byu-light">
          {professor.numRatings} ratings
        </div>
      </div>

      <div className="space-y-3 text-sm">
        <MetricRow icon={Star} label="Rating" value={`${professor.rating.toFixed(1)} / 5`} progress={ratingPct} />
        <MetricRow
          icon={Gauge}
          label="Difficulty"
          value={`${professor.difficulty.toFixed(1)} / 5`}
          progress={difficultyPct}
        />
        <MetricRow
          icon={BadgeCheck}
          label="Would take again"
          value={`${Math.round(professor.wouldTakeAgainPercent)}%`}
          progress={professor.wouldTakeAgainPercent}
        />
      </div>

      {professor.summary ? (
        <p className="mt-4 rounded-lg border border-border/70 bg-secondary/40 p-3 text-sm leading-relaxed text-muted-foreground">
          <BarChart3 className="mr-2 inline size-4 text-byu-light" />
          {professor.summary}
        </p>
      ) : null}

      {rmpUrl ? (
        <a
          href={rmpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-xs text-byu-blue hover:text-byu-light hover:underline"
        >
          <ExternalLink className="size-3" />
          View on RMP
        </a>
      ) : null}
    </div>
  )
}

function MetricRow({ icon: Icon, label, value, progress }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Icon className="size-3.5 text-byu-light" />
          {label}
        </span>
        <span className="font-mono text-foreground">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-byu-royal transition-[width] duration-300"
          style={{ width: `${Math.max(4, Math.min(progress, 100))}%` }}
        />
      </div>
    </div>
  )
}
