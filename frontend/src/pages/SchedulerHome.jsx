import { AlertTriangle, BarChart2, CalendarDays, ChevronDown, GraduationCap, MessageCircleQuestion, Sparkles, ShieldCheck, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { AIChatPanel } from '@/components/AIChatPanel'
import { CourseSearch } from '@/components/CourseSearch'
import { MajorTrackerPanel } from '@/components/MajorTrackerPanel'
import { ScheduleGrid } from '@/components/ScheduleGrid'
import { SectionDropdown } from '@/components/SectionDropdown'
import { WorkloadMeter } from '@/components/WorkloadMeter'
import { useCourses } from '@/hooks/useCourses'
import { GE_REQUIREMENTS } from '@/lib/geRequirements'
import { parseDegreeAudit } from '@/lib/parseDegreeAudit'
import {
  buildExclusiveOwners,
  estimateWeeklyLoadHours,
  getRequirementProgress,
  normalizeCourseId,
  requirementOptionIds,
} from '@/lib/scheduleUtils'

const BLOCK_COLORS = ['#0072CE', '#A73A64', '#D14124', '#00966C', '#9E2A2B', '#72246C', '#44693D']

const DAY_MAP = { M: 'MO', T: 'TU', W: 'WE', Th: 'TH', F: 'FR' }

/** Returns the Monday that anchors the semester's first full week, used as DTSTART in recurring ICS events. */
function semesterAnchorDate(yearterm) {
  if (!yearterm || yearterm.length < 5) return '20260907'
  const year = yearterm.slice(0, 4)
  const t = yearterm.slice(4)
  // Approximate first Monday of each BYU term
  const anchors = { '1': `${year}0105`, '2': `${year}0420`, '3': `${year}0629`, '4': `${year}0907` }
  return anchors[t] ?? `${year}0907`
}

function formatICSTime(timeStr) {
  const [h, m] = timeStr.split(':')
  return h.padStart(2, '0') + (m ?? '00').padStart(2, '0') + '00'
}

function buildICS(schedule, yearterm, termLabel) {
  const anchor = semesterAnchorDate(yearterm)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BYU Scheduler//EN',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:BYU Schedule' + (termLabel ? ` – ${termLabel}` : ''),
  ]
  for (const item of schedule) {
    for (const meeting of item.section.meetings) {
      if (!meeting.startTime || !meeting.endTime || !meeting.days?.length) continue
      const byDay = meeting.days.map((d) => DAY_MAP[d]).filter(Boolean).join(',')
      if (!byDay) continue
      const tStart = formatICSTime(meeting.startTime)
      const tEnd = formatICSTime(meeting.endTime)
      lines.push('BEGIN:VEVENT')
      lines.push(`SUMMARY:${item.courseId} – ${item.title}`)
      lines.push(`DTSTART;TZID=America/Denver:${anchor}T${tStart}`)
      lines.push(`DTEND;TZID=America/Denver:${anchor}T${tEnd}`)
      lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${byDay};COUNT=15`)
      lines.push(`LOCATION:${meeting.location ?? ''}`)
      lines.push(`DESCRIPTION:Instructor: ${item.section.instructor ?? ''}\\nSection: ${item.section.id}\\nCRN: ${item.section.crn ?? ''}`)
      lines.push('END:VEVENT')
    }
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

function downloadICS(schedule, yearterm, termLabel) {
  const content = buildICS(schedule, yearterm, termLabel)
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'byu-schedule.ics'
  a.click()
  URL.revokeObjectURL(url)
}

function loadJson(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    if (v) return JSON.parse(v) ?? fallback
  } catch { /* ignore */ }
  return fallback
}

function normalizeStoredOption(o) {
  if (typeof o === 'string') return o
  if (o && typeof o === 'object' && o.id) return { id: o.id, credits: o.credits }
  return null
}

function loadDegreeHoursFromStorage() {
  return loadJson('byu_degree_hours', null)
}

function loadMajorRequirementsFromStorage() {
  const raw = loadJson('byu_major_reqs', null)
  if (!raw || !Array.isArray(raw)) return null
  const mapReq = (r) => ({
    ...r,
    exclusivityScope: r.exclusivityScope ?? exclusivityScopeFromCategory(r.category),
    options: (r.options ?? []).map(normalizeStoredOption).filter(Boolean),
    children: (r.children ?? []).map(mapReq),
  })
  return raw.map(mapReq)
}

function exclusivityScopeFromCategory(category) {
  if (!category || typeof category !== 'string') return 'primary'
  if (/\(Minor\)|\bMINOR\s+Requirements?\b/i.test(category)) return 'minor'
  return 'primary'
}

function mapParsedAuditBranch(r) {
  return {
    id: r.id,
    label: r.label,
    category: r.category,
    credits: r.credits,
    source: 'major',
    exclusivityScope: exclusivityScopeFromCategory(r.category),
    aggregate: r.aggregate,
    options: (r.options ?? []).map((o) => (typeof o === 'string' ? o : { id: o.id, credits: o.credits })),
    children: r.children?.map(mapParsedAuditBranch),
  }
}

function countMajorLeafSlots(reqs) {
  if (!reqs?.length) return 0
  return reqs.reduce((sum, r) => {
    if (r.children?.length) return sum + countMajorLeafSlots(r.children)
    return sum + 1
  }, 0)
}

export function SchedulerHome() {
  const {
    courses,
    filteredCourses,
    query,
    setQuery,
    loading,
    error,
    term,
    yearterm,
    updatedAt,
    usingFallback,
    availableTerms,
    selectedYearterm,
    setSelectedYearterm,
  } = useCourses()

  const [schedule, setSchedule] = useState(() => loadJson(`byu_schedule_${yearterm}`, []))
  const [constraints, setConstraints] = useState(() => loadJson(`byu_constraints_${yearterm}`, []))
  const [expandedCourseId, setExpandedCourseId] = useState(null)
  const [preAiSchedule, setPreAiSchedule] = useState(null)
  const [colorPickerOpenId, setColorPickerOpenId] = useState(null)
  const [completedCourses, setCompletedCourses] = useState(() => loadJson('byu_completed', []))
  const [majorRequirements, setMajorRequirements] = useState(() => loadMajorRequirementsFromStorage())
  const [degreeHoursSummary, setDegreeHoursSummary] = useState(() => loadDegreeHoursFromStorage())
  const [majorName, setMajorName] = useState(() => localStorage.getItem('byu_major_name') ?? '')
  const [rightTab, setRightTab] = useState('ai') // 'ai' | 'tracker'
  const [aiTrigger, setAiTrigger] = useState(null) // { text, id }

  const handleAskAboutCourse = (courseId, courseTitle) => {
    setRightTab('ai')
    setAiTrigger({
      text: `Why is ${courseId} (${courseTitle}) a good choice for my schedule? What requirement does it fill, how does it fit my situation, and is there anything I should know about it?`,
      id: Date.now(),
    })
  }

  // When term changes, load that term's saved schedule and constraints
  useEffect(() => {
    if (!yearterm) return
    setSchedule(loadJson(`byu_schedule_${yearterm}`, []))
    setConstraints(loadJson(`byu_constraints_${yearterm}`, []))
    setExpandedCourseId(null)
    setPreAiSchedule(null)
  }, [yearterm])

  useEffect(() => {
    if (yearterm) {
      localStorage.setItem(`byu_schedule_${yearterm}`, JSON.stringify(schedule))
      // Fixed keys for the browser extension — always reflects the active term
      localStorage.setItem('byu_active_schedule', JSON.stringify(schedule))
      localStorage.setItem('byu_active_yearterm', yearterm)
    }
  }, [schedule, yearterm])
  useEffect(() => {
    if (yearterm) localStorage.setItem(`byu_constraints_${yearterm}`, JSON.stringify(constraints))
  }, [constraints, yearterm])
  useEffect(() => { localStorage.setItem('byu_completed', JSON.stringify(completedCourses)) }, [completedCourses])
  useEffect(() => { localStorage.setItem('byu_major_reqs', JSON.stringify(majorRequirements)) }, [majorRequirements])
  useEffect(() => {
    if (degreeHoursSummary) localStorage.setItem('byu_degree_hours', JSON.stringify(degreeHoursSummary))
    else localStorage.removeItem('byu_degree_hours')
  }, [degreeHoursSummary])
  useEffect(() => { localStorage.setItem('byu_major_name', majorName) }, [majorName])

  const courseMap = useMemo(() => {
    const m = new Map()
    for (const c of courses) { m.set(c.id, c); m.set(normalizeCourseId(c.id), c) }
    return m
  }, [courses])
  const totalCredits = useMemo(() => schedule.reduce((sum, item) => sum + item.credits, 0), [schedule])
  const workloadHours = useMemo(() => estimateWeeklyLoadHours(schedule), [schedule])
  const scheduledCourseIds = useMemo(() => new Set(schedule.map((s) => s.courseId)), [schedule])

  const completedSet = useMemo(() => new Set(completedCourses), [completedCourses])

  const allRequirements = useMemo(() => {
    const audit = majorRequirements ?? []
    // Degree PDF GE rows are not shown — static `GE_REQUIREMENTS` + completions from the PDF suffice.
    const majorFromAudit = audit.filter((r) => r.source === 'major')
    return [...GE_REQUIREMENTS, ...majorFromAudit]
  }, [majorRequirements])

  /** Within primary or minor, each course counts toward at most one requirement (GE excluded). */
  const exclusiveCourseContext = useMemo(
    () => ({
      primary: buildExclusiveOwners(allRequirements, completedCourses, 'primary'),
      minor: buildExclusiveOwners(allRequirements, completedCourses, 'minor'),
    }),
    [allRequirements, completedCourses],
  )

  const remainingMajorRequirements = useMemo(() => {
    return allRequirements
      .filter((r) => r.source === 'major' && !getRequirementProgress(r, completedCourses, exclusiveCourseContext).isDone)
      .map((r) => {
        const ids = requirementOptionIds(r)
        return ids.length === 1
          ? `${ids[0]} (${r.category}, ${r.credits}cr)`
          : `${r.label} [${ids.join('/')}] (${r.credits}cr)`
      })
  }, [allRequirements, completedCourses, exclusiveCourseContext])

  const remainingGERequirements = useMemo(() => {
    return allRequirements
      .filter((r) => r.source === 'ge' && !getRequirementProgress(r, completedCourses, exclusiveCourseContext).isDone)
      .map((r) => {
        const ids = requirementOptionIds(r)
        return ids.length === 1
          ? `${ids[0]} (${r.category}, ${r.credits}cr)`
          : `${r.label} GE [${ids.join('/')}] (${r.credits}cr)`
      })
  }, [allRequirements, completedCourses, exclusiveCourseContext])

  const handleDegreeAuditUpload = async (file) => {
    try {
      const result = await parseDegreeAudit(file)
      setMajorName(result.major)
      setDegreeHoursSummary(result.hoursSummary ?? null)
      setMajorRequirements(
        result.requirements
          .filter((r) => r.auditSection !== 'ge')
          .map((r, idx) => mapParsedAuditBranch({ ...r, id: r.id || `major-req-${idx}` })),
      )
      if (result.completedCourses?.length > 0) {
        setCompletedCourses(prev => [...new Set([...prev, ...result.completedCourses])])
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to parse the PDF. Please try again.')
    }
  }

  const handleRemoveDegreeProgress = () => {
    setMajorRequirements(null)
    setDegreeHoursSummary(null)
    setMajorName('')
    setCompletedCourses([])
  }

  // Hide completed courses from search results
  const visibleCourses = useMemo(() =>
    filteredCourses.filter(c => !completedSet.has(c.id))
  , [filteredCourses, completedSet])

  const handleToggleCompleted = (courseId) => {
    setCompletedCourses(prev =>
      prev.includes(courseId) ? prev.filter(id => id !== courseId) : [...prev, courseId]
    )
  }

  // Add course immediately on click from search, then open its dropdown
  const handleAddCourse = (course) => {
    if (!scheduledCourseIds.has(course.id)) {
      const section = course.sections[0]
      if (!section) return
      setSchedule((current) => {
        const withoutCourse = current.filter((item) => item.courseId !== course.id)
        return [
          ...withoutCourse,
          {
            courseId: course.id,
            title: course.title,
            credits: course.credits,
            section,
            color: BLOCK_COLORS[withoutCourse.length % BLOCK_COLORS.length],
          },
        ]
      })
    }
    setQuery('')
    setExpandedCourseId((prev) => (prev === course.id ? null : course.id))
  }

  const handleRemoveCourse = (courseId) => {
    setSchedule((current) => current.filter((item) => item.courseId !== courseId))
    if (expandedCourseId === courseId) setExpandedCourseId(null)
  }

  const handleChangeCourseSection = (courseId, newSection) => {
    setSchedule((current) =>
      current.map((item) => (item.courseId === courseId ? { ...item, section: newSection } : item)),
    )
  }

  const handleScheduleUpdate = (payload) => {
    setSchedule((current) => {
      setPreAiSchedule(current)
      let next = payload.clearSchedule ? [] : [...current]
      if (payload.removeCourseIds?.length) {
        next = next.filter((entry) => !payload.removeCourseIds.includes(entry.courseId))
      }
      if (payload.addSections?.length) {
        payload.addSections.forEach((action) => {
          const course = courseMap.get(action.courseId)
          if (!course) return
          const section = course.sections.find((s) => s.id === action.sectionId) || course.sections[0]
          if (!section) return
          next = next.filter((entry) => entry.courseId !== course.id)
          next.push({
            courseId: course.id,
            title: course.title,
            credits: course.credits,
            section,
            color: BLOCK_COLORS[next.length % BLOCK_COLORS.length],
          })
        })
      }
      return next
    })
  }

  const handleChangeCourseColor = (courseId, color) => {
    setSchedule((current) => current.map((item) => item.courseId === courseId ? { ...item, color } : item))
    setColorPickerOpenId(null)
  }

  const handleRevertSchedule = () => {
    if (preAiSchedule) {
      setSchedule(preAiSchedule)
      setPreAiSchedule(null)
    }
  }

  // Typing in search closes any open dropdown
  const handleQueryChange = (value) => {
    setQuery(value)
    if (value) setExpandedCourseId(null)
  }

  return (
    <main className="flex h-[calc(100vh-4.75rem)] flex-col overflow-hidden px-3 pt-3 sm:px-4 lg:px-6">
      {/* Status bar */}
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card/50 px-4 py-2">
        <p className="font-mono text-sm font-medium text-foreground">
          {loading ? 'Loading catalog…' : term || 'BYU Course Planner'}
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="size-3.5 shrink-0 text-byu-light" />
            <span className="text-muted-foreground/70">Term:</span>
            {availableTerms.length > 0 ? (
              <select
                value={selectedYearterm}
                onChange={(e) => setSelectedYearterm(e.target.value)}
                className="cursor-pointer rounded-md border border-border bg-secondary px-2 py-0.5 font-mono text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-byu-blue"
              >
                {availableTerms.map((t) => (
                  <option key={t.yearterm} value={t.yearterm} className="bg-card text-foreground">
                    {t.term}
                  </option>
                ))}
              </select>
            ) : (
              <span className="font-mono font-medium text-foreground">{term || '—'}</span>
            )}
          </div>
          <InfoChip icon={Sparkles} label="Selected" value={`${schedule.length} classes`} />
          <InfoChip icon={ShieldCheck} label="Constraints" value={`${constraints.length} blocks`} />
          {error ? <span className="text-xs text-amber-300">{error}</span> : null}
          {usingFallback ? <span className="text-xs text-amber-200">Offline data</span> : null}
          {updatedAt ? (
            <span className="text-xs text-muted-foreground/60">
              Updated {new Date(updatedAt).toLocaleDateString()}
            </span>
          ) : null}
        </div>
      </div>

      {/* 3-column layout */}
      <div className="grid min-h-0 flex-1 grid-cols-[270px_1fr_300px] gap-3 overflow-hidden">

        {/* Left: my schedule + course search */}
        <aside className="overflow-y-auto space-y-3">
          {schedule.length > 0 && (
            <section className="rounded-2xl border border-border/90 bg-card/80 p-4 shadow-sm backdrop-blur-sm">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">My Schedule</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => downloadICS(schedule, yearterm, term)}
                    title="Export to calendar (.ics)"
                    className="text-muted-foreground/60 transition-colors hover:text-byu-light"
                  >
                    <CalendarDays className="size-3.5" />
                  </button>
                  <span className="font-mono text-xs font-semibold text-byu-light">{totalCredits} cr</span>
                </div>
              </div>
              <ul className="space-y-1">
                {schedule.map((item) => {
                  const course = courseMap.get(item.courseId)
                  const isExpanded = expandedCourseId === item.courseId
                  const unmetPrereqs = (course?.prerequisites ?? []).filter(
                    p => !completedSet.has(normalizeCourseId(p))
                  )

                  return (
                    <li key={item.courseId}>
                      <button
                        type="button"
                        onClick={() => setExpandedCourseId((prev) => (prev === item.courseId ? null : item.courseId))}
                        className="group w-full flex items-center justify-between gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-left transition-colors hover:border-byu-blue/60 hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-byu-blue"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            role="button"
                            tabIndex={0}
                            title="Change color"
                            onClick={(e) => { e.stopPropagation(); setColorPickerOpenId((prev) => prev === item.courseId ? null : item.courseId) }}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setColorPickerOpenId((prev) => prev === item.courseId ? null : item.courseId) } }}
                            className="size-3 shrink-0 rounded-full cursor-pointer ring-1 ring-black/20 hover:ring-2 hover:ring-black/40 transition-all"
                            style={{ backgroundColor: item.color }}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              <p className="font-mono text-xs font-semibold text-foreground truncate">{item.courseId}</p>
                              {unmetPrereqs.length > 0 && (
                                <span title={`Missing prereqs: ${unmetPrereqs.join(', ')}`}>
                                  <AlertTriangle className="size-3 shrink-0 text-amber-400" />
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{item.title}</p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <span
                            role="button"
                            tabIndex={0}
                            title={`Ask AI about ${item.courseId}`}
                            onClick={(e) => { e.stopPropagation(); handleAskAboutCourse(item.courseId, item.title) }}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); handleAskAboutCourse(item.courseId, item.title) } }}
                            className="rounded p-0.5 text-muted-foreground/40 hover:text-byu-light transition-colors"
                            aria-label={`Ask AI about ${item.courseId}`}
                          >
                            <MessageCircleQuestion className="size-3.5" />
                          </span>
                          <ChevronDown className={`size-3.5 text-muted-foreground/60 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); handleRemoveCourse(item.courseId) }}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); handleRemoveCourse(item.courseId) } }}
                            className="rounded p-0.5 text-muted-foreground/50 hover:text-foreground transition-colors"
                            aria-label={`Remove ${item.courseId}`}
                          >
                            <X className="size-3.5" />
                          </span>
                        </div>
                      </button>

                      {colorPickerOpenId === item.courseId && (
                        <div className="mt-1 flex flex-wrap gap-1.5 rounded-lg border border-border bg-card p-2">
                          {BLOCK_COLORS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => handleChangeCourseColor(item.courseId, color)}
                              className="size-5 rounded-full ring-1 ring-black/20 hover:ring-2 hover:ring-black/50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-byu-blue"
                              style={{ backgroundColor: color }}
                              aria-label={`Set color to ${color}`}
                            />
                          ))}
                        </div>
                      )}

                      {isExpanded && course && (
                        <SectionDropdown
                          course={course}
                          currentSectionId={item.section?.id}
                          onSectionChange={(section) => handleChangeCourseSection(item.courseId, section)}
                        />
                      )}
                    </li>
                  )
                })}
              </ul>
              <button
                type="button"
                onClick={() => { setRightTab('ai'); setAiTrigger({ text: 'Analyze my current schedule. Comment on the workload level, course difficulty mix, time spread across the week, and anything I should know about these specific professors or courses.', id: Date.now() }) }}
                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary/80"
              >
                <BarChart2 className="size-3.5" />
                Analyze my schedule
              </button>
            </section>
          )}

          <CourseSearch
            courses={visibleCourses}
            query={query}
            onQueryChange={handleQueryChange}
            onAddCourse={handleAddCourse}
            scheduledCourseIds={scheduledCourseIds}
            suppressResults={!!expandedCourseId}
          />
        </aside>

        {/* Center: schedule grid */}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <ScheduleGrid
            schedule={schedule}
            onRemoveCourse={handleRemoveCourse}
            unavailableBlocks={constraints}
            onUnavailableBlocksChange={setConstraints}
          />
          <WorkloadMeter credits={totalCredits} workloadHours={workloadHours} />
        </div>

        {/* Right: AI chat / Major Tracker tabs */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/90 bg-card/80 shadow-sm backdrop-blur-sm">
          {/* Tab bar */}
          <div className="shrink-0 flex border-b border-border">
            <button
              type="button"
              onClick={() => setRightTab('ai')}
              className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-3 text-xs font-semibold transition-colors ${
                rightTab === 'ai'
                  ? 'border-b-2 border-byu-royal text-byu-royal'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Sparkles className="size-3.5" />
              AI Assistant
            </button>
            <button
              type="button"
              onClick={() => setRightTab('tracker')}
              className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-3 text-xs font-semibold transition-colors ${
                rightTab === 'tracker'
                  ? 'border-b-2 border-byu-royal text-byu-royal'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <GraduationCap className="size-3.5" />
              My Progress
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden p-3">
            <div className={rightTab === 'ai' ? 'flex h-full flex-col' : 'hidden'}>
              <AIChatPanel
                term={yearterm}
                schedule={schedule}
                constraints={constraints}
                onScheduleUpdate={handleScheduleUpdate}
                onRevertSchedule={preAiSchedule ? handleRevertSchedule : null}
                major={majorName}
                completedCourses={[...completedSet]}
                remainingMajorRequirements={remainingMajorRequirements}
                remainingGERequirements={remainingGERequirements}
                degreeAuditLoaded={majorRequirements !== null}
                majorSlotsTotal={majorRequirements ? countMajorLeafSlots(majorRequirements) : 0}
                triggerMessage={aiTrigger}
                onTriggerHandled={() => setAiTrigger(null)}
              />
            </div>
            <div className={rightTab === 'tracker' ? 'flex h-full flex-col' : 'hidden'}>
              <MajorTrackerPanel
                requirements={allRequirements}
                hoursSummary={degreeHoursSummary}
                exclusiveCourseContext={exclusiveCourseContext}
                majorLoaded={majorRequirements !== null}
                completedCourses={completedCourses}
                onToggleCompleted={handleToggleCompleted}
                onAddCourse={async (courseId) => {
                  const normalized = normalizeCourseId(courseId)
                  let course = courseMap.get(normalized) ?? courseMap.get(courseId)
                  if (!course) {
                    const { fetchCourseById } = await import('@/lib/api')
                    const terms = [yearterm, ...availableTerms.map(t => t.yearterm).filter(t => t !== yearterm)]
                    for (const t of terms) {
                      try { course = await fetchCourseById(normalized, t); break } catch { /* try next */ }
                    }
                  }
                  if (course) handleAddCourse(course)
                }}
                onUploadAudit={handleDegreeAuditUpload}
                onRemoveProgress={handleRemoveDegreeProgress}
              />
            </div>
          </div>
        </div>

      </div>
    </main>
  )
}

function InfoChip({ icon: Icon, label, value }) {
  return (
    <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="size-3.5 text-byu-light" />
      <span className="text-muted-foreground/70">{label}:</span>
      <span className="font-mono font-medium text-foreground">{value}</span>
    </div>
  )
}
