import { CalendarDays, ChevronDown, Github, GraduationCap, Linkedin, Sparkles, ShieldCheck, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { AIChatPanel } from '@/components/AIChatPanel'
import { CourseSearch } from '@/components/CourseSearch'
import { MajorTrackerPanel } from '@/components/MajorTrackerPanel'
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
          <Link to="/" className="flex items-center gap-2 cursor-pointer">
            <img src="/logo.png" alt="BYU Cougars" className="h-8 w-auto" />
            <span className="font-mono text-lg font-semibold text-foreground">BYU Scheduler</span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/"
              className="h-11 cursor-pointer pt-2.5 rounded-xl border text-center border-border px-4 text-sm font-medium text-foreground transition-colors duration-200 hover:border-byu-blue/70 hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-byu-blue"
            >
              Schedule
            </Link>
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
  const [colorPickerOpenId, setColorPickerOpenId] = useState(null)
  const [completedCourses, setCompletedCourses] = useState(() => loadJson('byu_completed', []))
  const [rightTab, setRightTab] = useState('ai') // 'ai' | 'tracker'

  useEffect(() => { localStorage.setItem('byu_schedule', JSON.stringify(schedule)) }, [schedule])
  useEffect(() => { localStorage.setItem('byu_constraints', JSON.stringify(constraints)) }, [constraints])
  useEffect(() => { localStorage.setItem('byu_completed', JSON.stringify(completedCourses)) }, [completedCourses])

  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses])
  const totalCredits = useMemo(() => schedule.reduce((sum, item) => sum + item.credits, 0), [schedule])
  const workloadHours = useMemo(() => estimateWeeklyLoadHours(schedule), [schedule])
  const scheduledCourseIds = useMemo(() => new Set(schedule.map((s) => s.courseId)), [schedule])

  const completedSet = useMemo(() => new Set(completedCourses), [completedCourses])

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
                completedCourses={[...completedSet]}
                remainingRequirements={[]}
              />
            ) : (
              <MajorTrackerPanel
                requirements={[]}
                completedCourses={completedCourses}
                onToggleCompleted={handleToggleCompleted}
                onAddCourse={(courseId) => { handleAddCourse(courseMap.get(courseId)); setRightTab('ai') }}
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

const CREATORS = [
  {
    name: 'Ben Jensen',
    github: 'jenbensen17',
    linkedin: 'https://www.linkedin.com/in/benjamin-m-jensen/',
  },
  {
    name: 'Roy Hales',
    github: 'royhalesx',
    linkedin: 'https://www.linkedin.com/in/roy-hales-240776271/',
  },
]

function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8 space-y-6">
      <section className="rounded-3xl border border-border bg-card/70 p-6 md:p-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-byu-light">About this project</p>
        <h1 className="mt-3 font-mono text-3xl font-semibold text-foreground">BYU Scheduler</h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          AI-powered course scheduling for BYU students. Build conflict-free schedules, compare professors,
          balance your workload, and get personalized suggestions — all in one place.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <article className="rounded-2xl border border-border bg-background/50 p-4">
            <h2 className="font-mono text-base font-semibold text-foreground">How it works</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Search courses, pick sections, review schedule conflicts and workload — then ask the AI assistant to refine your plan based on your constraints.
            </p>
          </article>
          <article className="rounded-2xl border border-border bg-background/50 p-4">
            <h2 className="font-mono text-base font-semibold text-foreground">AI Assistance</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Powered by Groq + LLaMA 3.3. The assistant knows your schedule, blocked times, and professor ratings so it can give actually useful advice.
            </p>
          </article>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card/70 p-6 md:p-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-byu-light">Built by</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {CREATORS.map((person) => (
            <div key={person.name} className="flex items-center gap-4 rounded-2xl border border-border bg-background/50 p-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-byu-royal/10 text-byu-royal font-mono font-bold text-lg">
                {person.name[0]}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground">{person.name}</p>
                <div className="mt-1.5 flex items-center gap-3">
                  <a
                    href={`https://github.com/${person.github}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Github className="size-3.5" />
                    {person.github}
                  </a>
                  <a
                    href={person.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-byu-royal transition-colors"
                  >
                    <Linkedin className="size-3.5" />
                    LinkedIn
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

export default App
