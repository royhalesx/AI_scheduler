import { X } from 'lucide-react'
import { useState } from 'react'
import {
  DAYS,
  END_MINUTES,
  START_MINUTES,
  formatTimeLabel,
  getBlockPosition,
  getConflictKeys,
  getTimeSlots,
  toggleConstraintBlock,
} from '@/lib/scheduleUtils'

const DAY_LABELS = {
  M: 'Mon',
  T: 'Tue',
  W: 'Wed',
  Th: 'Thu',
  F: 'Fri',
  Sa: 'Sat',
}

export function ScheduleGrid({
  schedule,
  onRemoveCourse,
  unavailableBlocks = [],
  onUnavailableBlocksChange,
}) {
  const [isDragging, setIsDragging] = useState(false)
  const timeSlots = getTimeSlots(30)
  const conflictKeys = getConflictKeys(schedule)

  const toggleBlock = (day, startTime) => {
    if (!onUnavailableBlocksChange) {
      return
    }

    const [hour, minute] = startTime.split(':').map(Number)
    const endMinutes = hour * 60 + minute + 30
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`

    onUnavailableBlocksChange(toggleConstraintBlock(unavailableBlocks, day, startTime, endTime))
  }

  const unavailableSet = new Set(unavailableBlocks.map((block) => `${block.day}-${block.startTime}-${block.endTime}`))

  return (
    <section className="rounded-2xl border border-border bg-card/70 p-3 shadow-[0_0_28px_rgba(15,23,42,0.55)] md:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">Hero Planner</p>
          <h2 className="font-mono text-xl font-semibold text-foreground">Weekly Schedule Grid</h2>
        </div>
        <div className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
          Drag to mark unavailable times
        </div>
      </div>

      <div
        className="overflow-x-auto"
        onMouseUp={() => setIsDragging(false)}
        onMouseLeave={() => setIsDragging(false)}
      >
        <div className="grid min-w-[52rem] grid-cols-[3.5rem_repeat(5,minmax(0,1fr))]">
          <div className="border-b border-border" />
          {DAYS.map((day) => (
            <div
              key={day}
              className="border-b border-l border-border px-2 py-2 text-center font-mono text-xs uppercase tracking-wide text-muted-foreground"
            >
              {DAY_LABELS[day]}
            </div>
          ))}

          <div className="relative border-r border-border">
            {timeSlots.map((time) => (
              <div
                key={time}
                className="h-8 border-b border-border/70 pr-2 text-right text-[10px] text-muted-foreground"
              >
                {time.endsWith(':00') ? formatTimeLabel(time) : ''}
              </div>
            ))}
          </div>

          {DAYS.map((day) => (
            <div key={day} className="relative border-l border-border">
              {timeSlots.map((time, index) => {
                const slotStart = time
                const slotEndMinutes = START_MINUTES + (index + 1) * 30
                if (slotEndMinutes > END_MINUTES) {
                  return null
                }

                const slotEnd = `${String(Math.floor(slotEndMinutes / 60)).padStart(2, '0')}:${String(
                  slotEndMinutes % 60,
                ).padStart(2, '0')}`
                const key = `${day}-${slotStart}-${slotEnd}`
                const isUnavailable = unavailableSet.has(key)

                return (
                  <button
                    key={key}
                    type="button"
                    onMouseDown={() => {
                      setIsDragging(true)
                      toggleBlock(day, slotStart)
                    }}
                    onMouseEnter={() => {
                      if (isDragging) {
                        toggleBlock(day, slotStart)
                      }
                    }}
                    className={`block h-8 w-full cursor-pointer border-b border-border/60 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                      isUnavailable ? 'bg-slate-500/30' : 'bg-transparent hover:bg-secondary/40'
                    }`}
                    aria-label={`Toggle unavailable time on ${DAY_LABELS[day]} at ${formatTimeLabel(slotStart)}`}
                  />
                )
              })}

              <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                {schedule.flatMap((course) =>
                  course.section.meetings
                    .filter((meeting) => meeting.days.includes(day))
                    .map((meeting, meetingIndex) => {
                      const position = getBlockPosition(meeting.startTime, meeting.endTime)
                      const conflictKey = `${course.courseId}-${course.section.id}-${day}-${meeting.startTime}`
                      const hasConflict = conflictKeys.has(conflictKey)

                      return (
                        <div
                          key={`${course.courseId}-${course.section.id}-${day}-${meetingIndex}`}
                          className={`pointer-events-auto absolute left-1 right-1 overflow-hidden rounded-md border p-1 shadow-md transition-colors duration-200 ${
                            hasConflict
                              ? 'border-rose-400 bg-rose-500/80 text-rose-50'
                              : 'border-black/20 text-slate-950'
                          }`}
                          style={{
                            top: `${position.topPct}%`,
                            height: `${position.heightPct}%`,
                            backgroundColor: hasConflict ? undefined : course.color,
                          }}
                        >
                          <div className="flex items-start justify-between gap-1 text-[10px]">
                            <div>
                              <p className="font-semibold">{course.courseId}</p>
                              <p className="truncate">{course.section.id}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => onRemoveCourse(course.courseId)}
                              className="inline-flex size-4 cursor-pointer items-center justify-center rounded bg-black/20 text-white transition-colors duration-150 hover:bg-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                              aria-label={`Remove ${course.courseId}`}
                            >
                              <X className="size-3" />
                            </button>
                          </div>
                        </div>
                      )
                    }),
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
