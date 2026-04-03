import { BookOpen, Clock, MapPin, Star, User, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import {
  DAYS,
  formatTimeLabel,
  timeToMinutes,
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

const DEFAULT_START = 8 * 60   // 8:00 AM
const DEFAULT_END   = 17 * 60  // 5:00 PM
const HARD_MIN      = 7 * 60   // 7:00 AM floor
const HARD_MAX      = 22 * 60  // 10:00 PM ceiling
const SLOT_MINUTES  = 60

function minutesToTimeStr(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function ScheduleGrid({
  schedule,
  onRemoveCourse,
  unavailableBlocks = [],
  onUnavailableBlocksChange,
}) {
  const [isDragging, setIsDragging] = useState(false)
  const [popup, setPopup] = useState(null) // { course, meeting, x, y }
  const gridRef = useRef(null)

  // Dynamic time range: shrink to ±1 hour around scheduled classes
  const { viewStart, viewEnd } = useMemo(() => {
    if (schedule.length === 0) {
      return { viewStart: DEFAULT_START, viewEnd: DEFAULT_END }
    }

    let earliest = Infinity
    let latest = -Infinity

    for (const course of schedule) {
      for (const meeting of course.section.meetings) {
        if (meeting.startTime && meeting.endTime) {
          const s = timeToMinutes(meeting.startTime ?? undefined)
          const e = timeToMinutes(meeting.endTime ?? undefined)
          if (s < earliest) earliest = s
          if (e > latest) latest = e
        }
      }
    }

    if (earliest === Infinity) return { viewStart: DEFAULT_START, viewEnd: DEFAULT_END }

    // Round boundaries outward to 30-min intervals and add buffer
    const start = Math.max(HARD_MIN, Math.floor((earliest - 60) / SLOT_MINUTES) * SLOT_MINUTES)
    const end   = Math.min(HARD_MAX, Math.ceil((latest + 60) / SLOT_MINUTES) * SLOT_MINUTES)

    return { viewStart: start, viewEnd: end }
  }, [schedule])

  // Generate time slots for the current view range
  const timeSlots = useMemo(() => {
    const slots = []
    for (let m = viewStart; m < viewEnd; m += SLOT_MINUTES) {
      slots.push(minutesToTimeStr(m))
    }
    return slots
  }, [viewStart, viewEnd])

  const conflictKeys = useMemo(() => {
    const keys = new Set()
    const meetings = []

    for (const course of schedule) {
      for (const meeting of course.section.meetings) {
        for (const day of meeting.days) {
          meetings.push({
            key: `${course.courseId}-${course.section.id}-${day}-${meeting.startTime}`,
            day,
            start: timeToMinutes(meeting.startTime),
            end: timeToMinutes(meeting.endTime),
          })
        }
      }
    }

    for (let i = 0; i < meetings.length; i++) {
      for (let j = i + 1; j < meetings.length; j++) {
        const a = meetings[i]
        const b = meetings[j]
        if (a.day === b.day && a.start < b.end && b.start < a.end) {
          keys.add(a.key)
          keys.add(b.key)
        }
      }
    }

    return keys
  }, [schedule])

  const unavailableSet = new Set(unavailableBlocks.map((block) => `${block.day}-${block.startTime}-${block.endTime}`))

  const toggleBlock = (day, startTime) => {
    if (!onUnavailableBlocksChange) return

    const [hour, minute] = startTime.split(':').map(Number)
    const endMinutes = hour * 60 + minute + SLOT_MINUTES
    const endTime = minutesToTimeStr(endMinutes)

    onUnavailableBlocksChange(toggleConstraintBlock(unavailableBlocks, day, startTime, endTime))
  }

  // Compute CSS position within the current view range
  const getPosition = (startTime, endTime) => {
    const start = timeToMinutes(startTime)
    const end = timeToMinutes(endTime)
    const range = viewEnd - viewStart
    return {
      topPct: ((start - viewStart) / range) * 100,
      heightPct: ((end - start) / range) * 100,
    }
  }

  return (
    <section ref={gridRef} className="relative rounded-2xl border border-border bg-card/70 p-3 shadow-sm md:p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">Schedule Planner</p>
          <h2 className="font-mono text-xl font-semibold text-foreground">Weekly Grid</h2>
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
        <div className="grid w-full grid-cols-[4.5rem_repeat(5,minmax(0,1fr))]">
          {/* Day headers */}
          <div className="border-b border-border" />
          {DAYS.map((day) => (
            <div
              key={day}
              className="border-b border-l border-border px-2 py-2 text-center font-mono text-xs uppercase tracking-wide text-muted-foreground"
            >
              {DAY_LABELS[day]}
            </div>
          ))}

          {/* Time labels */}
          <div className="relative border-r border-border">
            {timeSlots.map((time) => (
              <div
                key={time}
                className="h-14 border-b border-border/70 pr-2 text-right text-[10px] text-muted-foreground"
              >
                {formatTimeLabel(time)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {DAYS.map((day) => (
            <div key={day} className="relative border-l border-border">
              {timeSlots.map((time, index) => {
                const slotEndMinutes = viewStart + (index + 1) * SLOT_MINUTES
                if (slotEndMinutes > viewEnd) return null

                const slotEnd = minutesToTimeStr(slotEndMinutes)
                const key = `${day}-${time}-${slotEnd}`
                const isUnavailable = unavailableSet.has(key)

                return (
                  <button
                    key={key}
                    type="button"
                    onMouseDown={() => {
                      setIsDragging(true)
                      toggleBlock(day, time)
                    }}
                    onMouseEnter={() => {
                      if (isDragging) toggleBlock(day, time)
                    }}
                    className={`block h-14 w-full cursor-pointer border-b border-border/60 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-byu-blue ${
                      isUnavailable ? 'bg-slate-500/30' : 'bg-transparent hover:bg-secondary/40'
                    }`}
                    aria-label={`Toggle unavailable time on ${DAY_LABELS[day]} at ${formatTimeLabel(time)}`}
                  />
                )
              })}

              <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                {schedule.flatMap((course) =>
                  course.section.meetings
                    .filter((meeting) => meeting.days.includes(day) && meeting.startTime && meeting.endTime)
                    .map((meeting, meetingIndex) => {
                      const position = getPosition(meeting.startTime, meeting.endTime)
                      const conflictKey = `${course.courseId}-${course.section.id}-${day}-${meeting.startTime}`
                      const hasConflict = conflictKeys.has(conflictKey)

                      return (
                        <div
                          key={`${course.courseId}-${course.section.id}-${day}-${meetingIndex}`}
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            if (e.target.closest('button[aria-label]')) return
                            const rect = e.currentTarget.getBoundingClientRect()
                            setPopup({ course, meeting, x: rect.left, y: rect.top })
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.currentTarget.click() }}
                          className={`pointer-events-auto absolute left-1 right-1 cursor-pointer overflow-hidden rounded-md border p-1 shadow-md transition-colors duration-200 ${
                            hasConflict
                              ? 'border-rose-400 bg-rose-500/80 text-rose-50'
                              : 'border-black/20 text-white'
                          }`}
                          style={{
                            top: `${position.topPct}%`,
                            height: `${position.heightPct}%`,
                            backgroundColor: hasConflict ? undefined : course.color,
                          }}
                        >
                          <div className="flex items-start justify-between gap-1 text-[10px] leading-tight">
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold">{course.courseId} §{course.section.id}</p>
                              {course.title && <p className="truncate opacity-90">{course.title}</p>}
                              {meeting.startTime && meeting.endTime && (
                                <p className="opacity-80">{formatTimeLabel(meeting.startTime)}–{formatTimeLabel(meeting.endTime)}</p>
                              )}
                              {course.section.instructor && (
                                <p className="truncate opacity-80">
                                  {course.section.instructor.split(',')[0].trim()}
                                  {course.section.rmp?.rating != null && (
                                    <span className="ml-1 opacity-70">({course.section.rmp.rating.toFixed(1)})</span>
                                  )}
                                </p>
                              )}
                              {meeting.location && (
                                <p className="truncate opacity-70">{meeting.location}</p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => onRemoveCourse(course.courseId)}
                              className="inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded bg-black/20 text-white transition-colors duration-150 hover:bg-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
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

      {/* Course detail popup */}
      {popup && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPopup(null)} />
          <div
            className="fixed z-50 w-72 rounded-xl border border-border bg-card shadow-xl"
            style={(() => {
              const POPUP_H = 370
              const POPUP_W = 288
              const top = popup.y + POPUP_H > window.innerHeight - 16
                ? Math.max(8, popup.y - POPUP_H)
                : popup.y
              const left = Math.min(popup.x + 8, window.innerWidth - POPUP_W - 16)
              return { top, left }
            })()}
          >
            {/* Header */}
            <div
              className="flex items-start justify-between rounded-t-xl px-4 py-3"
              style={{ backgroundColor: popup.course.color ?? '#0072CE' }}
            >
              <div>
                <p className="font-mono text-sm font-bold text-white">{popup.course.courseId}</p>
                <p className="text-xs font-medium text-white/90">{popup.course.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setPopup(null)}
                className="mt-0.5 rounded p-0.5 text-white/70 hover:bg-black/20 hover:text-white"
              >
                <X className="size-3.5" />
              </button>
            </div>

            {/* Body */}
            <div className="space-y-2 px-4 py-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <BookOpen className="size-3.5 shrink-0" />
                <span>Section {popup.course.section.id} · {popup.course.credits} cr</span>
              </div>
              {popup.course.section.instructor && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="size-3.5 shrink-0" />
                  <span>{popup.course.section.instructor}</span>
                </div>
              )}
              {popup.course.section.rmp?.rating != null && (
                <div className="rounded-lg border border-border bg-secondary/50 p-2">
                  <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                    <Star className="size-3 text-byu-light" /> RMP
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center">
                    <div>
                      <p className="text-sm font-bold text-byu-light">{popup.course.section.rmp.rating.toFixed(1)}<span className="text-xs font-normal text-muted-foreground">/5</span></p>
                      <p className="text-[10px] text-muted-foreground">Quality</p>
                    </div>
                    {popup.course.section.rmp.difficulty != null && (
                      <div>
                        <p className="text-sm font-bold text-foreground">{popup.course.section.rmp.difficulty.toFixed(1)}<span className="text-xs font-normal text-muted-foreground">/5</span></p>
                        <p className="text-[10px] text-muted-foreground">Difficulty</p>
                      </div>
                    )}
                    {popup.course.section.rmp.wouldTakeAgainPercent != null && (
                      <div>
                        <p className="text-sm font-bold text-foreground">{Math.round(popup.course.section.rmp.wouldTakeAgainPercent)}<span className="text-xs font-normal text-muted-foreground">%</span></p>
                        <p className="text-[10px] text-muted-foreground">Again</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="size-3.5 shrink-0" />
                <span>
                  {popup.meeting.days.join('')} · {formatTimeLabel(popup.meeting.startTime)}–{formatTimeLabel(popup.meeting.endTime)}
                </span>
              </div>
              {popup.meeting.location && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="size-3.5 shrink-0" />
                  <span>{popup.meeting.location}</span>
                </div>
              )}
              {popup.course.section.seats && (
                <div className="flex items-center justify-between rounded-lg bg-secondary px-3 py-1.5 text-xs">
                  <span className="text-muted-foreground">Seats</span>
                  <span className={`font-semibold ${popup.course.section.seats.available <= 5 ? 'text-rose-400' : 'text-foreground'}`}>
                    {popup.course.section.seats.available} / {popup.course.section.seats.capacity} open
                  </span>
                </div>
              )}
            </div>

            {/* Remove button */}
            <div className="border-t border-border px-4 py-2">
              <button
                type="button"
                onClick={() => { onRemoveCourse(popup.course.courseId); setPopup(null) }}
                className="w-full rounded-lg px-3 py-1.5 text-xs text-rose-400 transition-colors hover:bg-rose-500/10"
              >
                Remove from schedule
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
