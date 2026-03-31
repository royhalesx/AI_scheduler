import { CalendarDays, ChevronDown, Sparkles, ShieldCheck, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { AIChatPanel } from '@/components/AIChatPanel'
import { CourseSearch } from '@/components/CourseSearch'
import { ScheduleGrid } from '@/components/ScheduleGrid'
import { SectionDropdown } from '@/components/SectionDropdown'
import { WorkloadMeter } from '@/components/WorkloadMeter'
import { useCourses } from '@/hooks/useCourses'
import { estimateWeeklyLoadHours } from '@/lib/scheduleUtils'

const BLOCK_COLORS = ['#0072CE', '#A73A64', '#D14124', '#00966C', '#9E2A2B', '#72246C', '#44693D']

function loadJson(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    if (v) return JSON.parse(v) ?? fallback
  } catch { /* ignore */ }
  return fallback
}

function App() {

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/90 bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="cursor-pointer font-mono text-lg font-semibold text-foreground">
            BYU Scheduler
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/about"
              className="h-11 cursor-pointer pt-2.5 rounded-xl border text-center border-border px-4 text-sm font-medium text-foreground transition-colors duration-200 hover:border-byu-blue/70 hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-byu-blue"
            >
              About
            </Link>
            <button
              type="button"
              className="h-11 cursor-pointer rounded-xl bg-byu-royal px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-byu-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-byu-blue"
            >
              Personal Info
            </button>
          </nav>
        </div>
      </header>

      <Routes>
        <Route path="/" element={<SchedulerHome />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

function SchedulerHome() {
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

  const [schedule, setSchedule] = useState(() => loadJson('byu_schedule', []))
  const [constraints, setConstraints] = useState(() => loadJson('byu_constraints', []))
  const [expandedCourseId, setExpandedCourseId] = useState(null)
  const [preAiSchedule, setPreAiSchedule] = useState(null)

  useEffect(() => { localStorage.setItem('byu_schedule', JSON.stringify(schedule)) }, [schedule])
  useEffect(() => { localStorage.setItem('byu_constraints', JSON.stringify(constraints)) }, [constraints])

  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses])
  const totalCredits = useMemo(() => schedule.reduce((sum, item) => sum + item.credits, 0), [schedule])
  const workloadHours = useMemo(() => estimateWeeklyLoadHours(schedule), [schedule])
  const scheduledCourseIds = useMemo(() => new Set(schedule.map((s) => s.courseId)), [schedule])

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
                          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                          <div className="min-w-0">
                            <p className="font-mono text-xs font-semibold text-foreground truncate">{item.courseId}</p>
                            <p className="text-xs text-muted-foreground truncate">{item.credits} cr · §{item.section?.id}</p>
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
            courses={filteredCourses}
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

        {/* Right: AI chat only */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/90 bg-card/80 shadow-sm backdrop-blur-sm">
          <div className="shrink-0 border-b border-border px-4 py-3">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">AI Co-Pilot</p>
            <h3 className="font-mono text-sm font-semibold text-foreground">Schedule Assistant</h3>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden p-3">
            <AIChatPanel
              term={yearterm}
              schedule={schedule}
              constraints={constraints}
              onScheduleUpdate={handleScheduleUpdate}
              onRevertSchedule={preAiSchedule ? handleRevertSchedule : null}
            />
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

function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-border bg-card/70 p-6 md:p-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-byu-light">About this project</p>
        <h1 className="mt-3 font-mono text-3xl font-semibold text-foreground">AI Scheduling for the Competition Track</h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          This frontend helps students plan a balanced BYU schedule by combining weekly calendar visualization,
          professor quality insights, and AI-driven recommendations.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <article className="rounded-2xl border border-border bg-background/50 p-4">
            <h2 className="font-mono text-base font-semibold text-foreground">Workflow</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Search a course, pick a section, review overlap and workload, then ask the assistant to refine your plan.
            </p>
          </article>
          <article className="rounded-2xl border border-border bg-background/50 p-4">
            <h2 className="font-mono text-base font-semibold text-foreground">AI Assistance</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              The assistant receives your selected classes and time constraints so it can suggest realistic schedule
              improvements.
            </p>
          </article>
        </div>
      </section>
    </main>
  )
}

export default App
