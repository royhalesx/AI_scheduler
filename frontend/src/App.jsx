import { CalendarDays, ShieldCheck, Sparkles, WandSparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { AIChatPanel } from '@/components/AIChatPanel'
import { CourseSearch } from '@/components/CourseSearch'
import { ScheduleGrid } from '@/components/ScheduleGrid'
import { SectionPicker } from '@/components/SectionPicker'
import { WorkloadMeter } from '@/components/WorkloadMeter'
import { useCourses } from '@/hooks/useCourses'
import { estimateWeeklyLoadHours } from '@/lib/scheduleUtils'

const BLOCK_COLORS = ['#22D3EE', '#A78BFA', '#FB7185', '#FACC15', '#22C55E', '#60A5FA', '#F97316']

function App() {
  useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.16),_transparent_42%),radial-gradient(circle_at_80%_20%,_rgba(59,130,246,0.13),_transparent_36%)]"
        aria-hidden="true"
      />
      <header className="sticky top-0 z-20 border-b border-border/90 bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="cursor-pointer font-mono text-lg font-semibold text-foreground">
            AI Schedule Competition
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/about"
              className="h-11 cursor-pointer pt-2.5 rounded-xl border text-center border-border px-4 text-sm font-medium text-foreground transition-colors duration-200 hover:border-emerald-400/70 hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              About
            </Link>
            {/* This can be changed later but I'm intending the user to list their major and 
            whether they're looking for easy classes or good professors etc... */}
            <button
              type="button"
              className="h-11 cursor-pointer rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-emerald-950 transition-colors duration-200 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
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
  const { courses, filteredCourses, query, setQuery, loading, error, term, updatedAt, usingFallback } = useCourses()
  const [selectedCourse, setSelectedCourse] = useState(null)
  const [schedule, setSchedule] = useState([])
  const [constraints, setConstraints] = useState([])

  const courseMap = useMemo(() => new Map(courses.map((course) => [course.id, course])), [courses])

  const totalCredits = useMemo(() => schedule.reduce((sum, item) => sum + item.credits, 0), [schedule])

  const workloadHours = useMemo(() => estimateWeeklyLoadHours(schedule), [schedule])

  const handleSelectSection = (course, section) => {
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

  const handleScheduleUpdate = (payload) => {
    setSchedule((current) => {
      let nextSchedule = [...current]

      if (payload.removeCourseIds?.length) {
        nextSchedule = nextSchedule.filter((entry) => !payload.removeCourseIds?.includes(entry.courseId))
      }

      if (payload.addSections?.length) {
        payload.addSections.forEach((action) => {
          const course = courseMap.get(action.courseId)
          if (!course) {
            return
          }

          const section = course.sections.find((option) => option.id === action.sectionId) || course.sections[0]
          if (!section) {
            return
          }

          nextSchedule = nextSchedule.filter((entry) => entry.courseId !== course.id)
          nextSchedule.push({
            courseId: course.id,
            title: course.title,
            credits: course.credits,
            section,
            color: BLOCK_COLORS[nextSchedule.length % BLOCK_COLORS.length],
          })
        })
      }

      return nextSchedule
    })
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <section className="mb-6 rounded-3xl border border-border bg-card/60 p-5 md:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-emerald-300">Marketplace-grade planning flow</p>
            <h1 className="mt-2 font-mono text-3xl font-semibold leading-tight text-foreground sm:text-4xl lg:text-5xl">
              Build a conflict-free BYU schedule with AI assistance
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Search courses first, compare sections by professor quality, and let the assistant optimize around your
              blocked times.
            </p>
          </div>
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3 lg:w-auto">
            <InfoChip icon={CalendarDays} label="Term" value={term || 'Loading...'} />
            <InfoChip icon={Sparkles} label="Selected" value={`${schedule.length} classes`} />
            <InfoChip icon={ShieldCheck} label="Constraints" value={`${constraints.length} blocks`} />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-6">
          <CourseSearch
            courses={filteredCourses}
            query={query}
            onQueryChange={setQuery}
            onAddCourse={(course) => setSelectedCourse(course)}
          />

          {loading ? (
            <div className="rounded-2xl border border-border bg-card/70 p-5 text-sm text-muted-foreground">
              Loading course catalog...
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-100">
              {error}
            </div>
          ) : null}

          <ScheduleGrid
            schedule={schedule}
            onRemoveCourse={(courseId) => setSchedule((current) => current.filter((item) => item.courseId !== courseId))}
            unavailableBlocks={constraints}
            onUnavailableBlocksChange={setConstraints}
          />

          <WorkloadMeter credits={totalCredits} workloadHours={workloadHours} />
        </div>

        <div className="grid grid-cols-1 gap-6">
          <SectionPicker
            course={selectedCourse}
            onSelectSection={handleSelectSection}
            onClose={() => setSelectedCourse(null)}
          />

          <AIChatPanel schedule={schedule} constraints={constraints} onScheduleUpdate={handleScheduleUpdate} />

          <div className="rounded-2xl border border-border bg-card/70 p-4 text-sm text-muted-foreground">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-foreground">Trust &amp; Safety</p>
            <ul className="mt-2 space-y-2">
              <li className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 size-4 text-emerald-300" />
                Constraints never leave your session except when you explicitly ask AI for optimization.
              </li>
              <li className="flex items-start gap-2">
                <WandSparkles className="mt-0.5 size-4 text-cyan-300" />
                Suggestions are reversible before final registration.
              </li>
            </ul>
            {updatedAt ? (
              <p className="mt-3 text-xs text-muted-foreground/90">Catalog updated: {new Date(updatedAt).toLocaleString()}</p>
            ) : null}
            {usingFallback ? (
              <p className="mt-1 text-xs text-amber-200">Using static fallback dataset for reliability.</p>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  )
}

function InfoChip({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-border bg-background/50 p-3">
      <p className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5 text-emerald-300" />
        {label}
      </p>
      <p className="mt-1 font-mono text-sm font-semibold text-foreground">{value}</p>
    </div>
  )
}

function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-border bg-card/70 p-6 md:p-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-emerald-300">About this project</p>
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
