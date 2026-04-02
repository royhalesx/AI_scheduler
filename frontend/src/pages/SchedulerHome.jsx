import { CalendarDays, ChevronDown, GraduationCap, Sparkles, ShieldCheck, X } from 'lucide-react'
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
import { estimateWeeklyLoadHours, normalizeCourseId } from '@/lib/scheduleUtils'

const BLOCK_COLORS = ['#0072CE', '#A73A64', '#D14124', '#00966C', '#9E2A2B', '#72246C', '#44693D']

function loadJson(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    if (v) return JSON.parse(v) ?? fallback
  } catch { /* ignore */ }
  return fallback
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
  const [majorRequirements, setMajorRequirements] = useState(() => loadJson('byu_major_reqs', null))
  const [majorName, setMajorName] = useState(() => localStorage.getItem('byu_major_name') ?? '')
  const [rightTab, setRightTab] = useState('ai') // 'ai' | 'tracker'

  // When term changes, load that term's saved schedule and constraints
  useEffect(() => {
    if (!yearterm) return
    setSchedule(loadJson(`byu_schedule_${yearterm}`, []))
    setConstraints(loadJson(`byu_constraints_${yearterm}`, []))
    setExpandedCourseId(null)
    setPreAiSchedule(null)
  }, [yearterm])

  useEffect(() => {
    if (yearterm) localStorage.setItem(`byu_schedule_${yearterm}`, JSON.stringify(schedule))
  }, [schedule, yearterm])
  useEffect(() => {
    if (yearterm) localStorage.setItem(`byu_constraints_${yearterm}`, JSON.stringify(constraints))
  }, [constraints, yearterm])
  useEffect(() => { localStorage.setItem('byu_completed', JSON.stringify(completedCourses)) }, [completedCourses])
  useEffect(() => { localStorage.setItem('byu_major_reqs', JSON.stringify(majorRequirements)) }, [majorRequirements])
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

  const allRequirements = useMemo(() => [
    ...GE_REQUIREMENTS,
    ...(majorRequirements ?? []),
  ], [majorRequirements])

  const remainingMajorRequirements = useMemo(() => {
    return allRequirements
      .filter(r => r.source === 'major' && !r.options.some(id => completedSet.has(id)))
      .map((r) =>
        r.options.length === 1
          ? `${r.options[0]} (${r.category}, ${r.credits}cr)`
          : `${r.label} [${r.options.join('/')}] (${r.credits}cr)`,
      )
  }, [allRequirements, completedSet])

  const remainingGERequirements = useMemo(() => {
    return allRequirements
      .filter(r => r.source === 'ge' && !r.options.some(id => completedSet.has(id)))
      .map((r) =>
        r.options.length === 1
          ? `${r.options[0]} (${r.category}, ${r.credits}cr)`
          : `${r.label} GE [${r.options.join('/')}] (${r.credits}cr)`,
      )
  }, [allRequirements, completedSet])

  const handleDegreeAuditUpload = async (file) => {
    try {
      const result = await parseDegreeAudit(file)
      setMajorName(result.major)
      setMajorRequirements(result.requirements.map((r, idx) => ({
        id: r.id || `major-req-${idx}`,
        label: r.label,
        category: r.category,
        credits: r.credits,
        source: 'major',
        options: r.options,
      })))
      if (result.completedCourses?.length > 0) {
        setCompletedCourses(prev => [...new Set([...prev, ...result.completedCourses])])
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to parse the PDF. Please try again.')
    }
  }

  const handleRemoveDegreeProgress = () => {
    setMajorRequirements(null)
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
      let next = [...current]
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
              <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">My Schedule</p>
              <ul className="space-y-1">
                {schedule.map((item) => {
                  const course = courseMap.get(item.courseId)
                  const isExpanded = expandedCourseId === item.courseId

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
                            <p className="font-mono text-xs font-semibold text-foreground truncate">{item.courseId}</p>
                            <p className="text-xs text-muted-foreground truncate">{item.title}</p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
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
            {rightTab === 'ai' ? (
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
              />
            ) : (
              <MajorTrackerPanel
                requirements={allRequirements}
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
            )}
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
