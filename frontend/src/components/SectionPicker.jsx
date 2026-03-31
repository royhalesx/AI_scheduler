import { Loader2, Users } from 'lucide-react'
import { useState } from 'react'
import { fetchProfessor } from '@/lib/api'
import { formatTimeLabel } from '@/lib/scheduleUtils'
import { ProfessorCard } from './ProfessorCard'

export function SectionPicker({ course, onSelectSection, onClose }) {
  const [selectedProfessor, setSelectedProfessor] = useState(null)
  const [loadingProfessor, setLoadingProfessor] = useState(false)

  if (!course) {
    return null
  }

  const loadProfessor = async (instructor) => {
    setLoadingProfessor(true)

    try {
      const data = await fetchProfessor(instructor)
      setSelectedProfessor({ name: instructor, data })
    } catch {
      setSelectedProfessor({
        name: instructor,
        data: {
          rating: 0,
          difficulty: 0,
          wouldTakeAgain: 0,
          numRatings: 0,
          summary: 'No professor insights currently available.',
        },
      })
    } finally {
      setLoadingProfessor(false)
    }
  }

  return (
    <aside className="rounded-2xl border border-border bg-card/80 p-4 md:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">Section Picker</p>
          <h3 className="font-mono text-lg font-semibold text-foreground">{course.id}</h3>
          <p className="text-sm text-muted-foreground">{course.title}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-9 cursor-pointer rounded-lg border border-border px-3 text-sm text-foreground transition-colors duration-200 hover:border-blue-400/70 hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          Close
        </button>
      </div>

      <div className="space-y-3">
        {course.sections.map((section) => (
          <div key={section.id} className="rounded-xl border border-border bg-background/60 p-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <p className="font-mono text-sm font-semibold text-foreground">Section {section.id}</p>
                <p className="text-xs text-muted-foreground">CRN {section.crn}</p>
              </div>
              <button
                type="button"
                onClick={() => onSelectSection(course, section)}
                className="h-9 cursor-pointer rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white transition-colors duration-200 hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                Add to schedule
              </button>
            </div>

            <div className="space-y-1 text-xs text-muted-foreground">
              {section.meetings.map((meeting, index) => (
                <p key={`${meeting.location}-${index}`}>
                  {meeting.days.join('/')} · {formatTimeLabel(meeting.startTime)}–{formatTimeLabel(meeting.endTime)} ·{' '}
                  {meeting.location}
                </p>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => loadProfessor(section.instructor)}
                className="cursor-pointer text-sm text-blue-300 transition-colors duration-200 hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                {section.instructor}
              </button>
              <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="size-3.5" />
                {section.seats.available} / {section.seats.capacity} seats available
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 min-h-24">
        {loadingProfessor ? (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-background/40 p-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading professor insights...
          </div>
        ) : selectedProfessor ? (
          <ProfessorCard professor={selectedProfessor.data} name={selectedProfessor.name} />
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-background/40 p-4 text-sm text-muted-foreground">
            Click an instructor name to view professor insights.
          </div>
        )}
      </div>
    </aside>
  )
}
