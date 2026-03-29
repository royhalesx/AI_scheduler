import type { ConstraintBlock, Meeting, ScheduledCourse, Weekday } from '@/types/scheduler'

export const DAYS: Weekday[] = ['M', 'T', 'W', 'Th', 'F']

export const START_MINUTES = 7 * 60
export const END_MINUTES = 22 * 60

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export function minutesToTime(totalMinutes: number): string {
  const safeMinutes = Math.max(0, Math.floor(totalMinutes))
  const hours = Math.floor(safeMinutes / 60)
  const minutes = safeMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function formatTimeLabel(time: string): string {
  const [hoursRaw, minutes] = time.split(':')
  const hours = Number(hoursRaw)
  const period = hours >= 12 ? 'PM' : 'AM'
  const standardHours = hours % 12 || 12
  return `${standardHours}:${minutes} ${period}`
}

export function getMeetingRange(meeting: Meeting): { start: number; end: number } {
  return {
    start: timeToMinutes(meeting.startTime),
    end: timeToMinutes(meeting.endTime),
  }
}

export function hasOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end
}

export function getConflictKeys(schedule: ScheduledCourse[]): Set<string> {
  const conflicts = new Set<string>()

  for (let i = 0; i < schedule.length; i += 1) {
    for (let j = i + 1; j < schedule.length; j += 1) {
      const current = schedule[i]
      const compare = schedule[j]

      for (const currentMeeting of current.section.meetings) {
        const currentRange = getMeetingRange(currentMeeting)

        for (const compareMeeting of compare.section.meetings) {
          const compareRange = getMeetingRange(compareMeeting)
          const sharedDays = currentMeeting.days.filter((day) => compareMeeting.days.includes(day))

          if (sharedDays.length > 0 && hasOverlap(currentRange, compareRange)) {
            sharedDays.forEach((day) => {
              conflicts.add(`${current.courseId}-${current.section.id}-${day}-${currentMeeting.startTime}`)
              conflicts.add(`${compare.courseId}-${compare.section.id}-${day}-${compareMeeting.startTime}`)
            })
          }
        }
      }
    }
  }

  return conflicts
}

export function getBlockPosition(startTime: string, endTime: string): { topPct: number; heightPct: number } {
  const start = Math.max(timeToMinutes(startTime), START_MINUTES)
  const end = Math.min(timeToMinutes(endTime), END_MINUTES)
  const totalWindow = END_MINUTES - START_MINUTES

  return {
    topPct: ((start - START_MINUTES) / totalWindow) * 100,
    heightPct: (Math.max(30, end - start) / totalWindow) * 100,
  }
}

export function getTimeSlots(stepMinutes = 30): string[] {
  const slots: string[] = []

  for (let current = START_MINUTES; current <= END_MINUTES; current += stepMinutes) {
    slots.push(minutesToTime(current))
  }

  return slots
}

export function createConstraintBlock(day: Weekday, startTime: string, endTime: string): ConstraintBlock {
  return { day, startTime, endTime }
}

export function toggleConstraintBlock(
  current: ConstraintBlock[],
  day: Weekday,
  startTime: string,
  endTime: string,
): ConstraintBlock[] {
  const key = `${day}-${startTime}-${endTime}`
  const existing = current.find((block) => `${block.day}-${block.startTime}-${block.endTime}` === key)

  if (existing) {
    return current.filter((block) => `${block.day}-${block.startTime}-${block.endTime}` !== key)
  }

  return [...current, createConstraintBlock(day, startTime, endTime)]
}

export function estimateWeeklyLoadHours(schedule: ScheduledCourse[]): number {
  const classHours = schedule.reduce((total, item) => {
    const minutes = item.section.meetings.reduce((sum, meeting) => {
      const range = getMeetingRange(meeting)
      return sum + (range.end - range.start) * meeting.days.length
    }, 0)

    return total + minutes / 60
  }, 0)

  const credits = schedule.reduce((sum, course) => sum + course.credits, 0)
  return Number((classHours + credits * 2.25).toFixed(1))
}
