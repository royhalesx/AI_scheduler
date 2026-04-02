import { CheckCircle2, Search, Star, X } from 'lucide-react'

export function CourseSearch({ courses, query, onQueryChange, onAddCourse, scheduledCourseIds = new Set(), suppressResults = false }) {
  return (
    <section className="rounded-2xl border border-border/90 bg-card/80 p-4 shadow-sm backdrop-blur-sm md:p-5">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-background/60 px-3 py-2 transition-all duration-200 focus-within:border-byu-blue focus-within:ring-2 focus-within:ring-byu-blue/50">
        <Search className="size-4 text-muted-foreground" />
        <label htmlFor="course-search" className="sr-only">
          Search courses
        </label>
        <input
          id="course-search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search courses"
          className="h-10 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/80 focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange('')}
            className="shrink-0 text-muted-foreground/60 hover:text-foreground transition-colors"
            aria-label="Clear search"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {suppressResults ? null : <ul className="mt-3 space-y-2">
        {courses.length > 0 ? (
          courses.map((course) => {
            const isScheduled = scheduledCourseIds.has(course.id)
            const avgRating = course.sections.find((s) => s.rmp?.rating)?.rmp?.rating

            return (
              <li key={course.id}>
                <button
                  type="button"
                  onClick={() => onAddCourse(course)}
                  className={`group w-full cursor-pointer rounded-xl border p-3 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-byu-blue ${isScheduled
                      ? 'border-byu-royal/40 bg-byu-royal/10'
                      : 'border-border bg-background/50 hover:border-byu-blue/60 hover:bg-secondary/50'
                    }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {isScheduled && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-byu-blue" />}
                      <div>
                        <p className="font-mono text-sm font-semibold text-foreground">{course.id}</p>
                        <p className="text-sm text-muted-foreground">{course.title}</p>
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>{course.credits} credits</p>
                      <p>{course.sections.length} sections</p>
                      {avgRating != null && (
                        <p className="mt-0.5 inline-flex items-center gap-1 text-amber-600">
                          <Star className="size-3" />
                          {avgRating.toFixed(1)}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            )
          })
        ) : query ? (
          <li className="rounded-xl border border-dashed border-border bg-background/40 p-4 text-sm text-muted-foreground">
            No matches found. Try searching by code (e.g., CS 235) or instructor.
          </li>
        ) : (
          <li className="p-4 text-sm text-muted-foreground/60 text-center">
            Search above to find courses
          </li>
        )}
      </ul>}
    </section>
  )
}
