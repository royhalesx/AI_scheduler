import { useEffect, useState } from 'react'
import { fetchProfessor } from '@/lib/api'
import { formatTimeLabel } from '@/lib/scheduleUtils'
import { ProfessorCard } from './ProfessorCard'

export function SectionDropdown({ course, currentSectionId, onSectionChange }) {
  const currentSection = course.sections.find((s) => s.id === currentSectionId)
  const [professorData, setProfessorData] = useState(null)

  useEffect(() => {
    const instructor = currentSection?.instructor
    if (!instructor || instructor === 'TBA') {
      setProfessorData(null)
      return
    }
    let cancelled = false
    fetchProfessor(instructor)
      .then((data) => { if (!cancelled) setProfessorData({ name: instructor, data }) })
      .catch(() => { if (!cancelled) setProfessorData(null) })
    return () => { cancelled = true }
  }, [currentSection?.instructor])

  return (
    <div className="mt-1 space-y-1 rounded-lg border border-border/60 bg-background/80 p-2">
      <p className="px-1 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground/60">Sections</p>

      {course.sections.map((section) => {
        const isSelected = section.id === currentSectionId
        const times = section.meetings
          .filter((m) => m.startTime)
          .map((m) => `${m.days.join('')} ${formatTimeLabel(m.startTime)}–${formatTimeLabel(m.endTime)}`)
          .join(', ') || 'TBA'

        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onSectionChange(section)}
            className={`w-full rounded-lg px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-byu-blue ${
              isSelected
                ? 'border border-byu-royal/40 bg-byu-royal/20 text-foreground'
                : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono font-semibold shrink-0">§{section.id}</span>
              <span className="truncate">{section.instructor}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground/60">
                {section.seats.available} open
              </span>
            </div>
            <div className="mt-0.5 text-muted-foreground/70">{times}</div>
          </button>
        )
      })}

      {professorData && (
        <div className="mt-2 border-t border-border/40 pt-2">
          <ProfessorCard professor={professorData.data} name={professorData.name} />
        </div>
      )}
    </div>
  )
}
