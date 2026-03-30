import { Search } from 'lucide-react'
import { useEffect } from 'react'

const POPULAR_SEARCHES = ['CS 235', 'ECON 110', 'MATH 112', 'IS 201', 'ACC 200', 
  'Claude generates based on their previous classes and major requirements']

export function CourseSearch({ courses, query, onQueryChange, onAddCourse }) {

  // Maybe incorporate fuzzy search or firstname, lastname search
  // useEffect(() =>{
  //    if(courses.list == 0 && query.length > 0){
  //   console.log("No match")
  // }
  // }, [query])

  return (
    <section className="rounded-2xl border border-border/90 bg-card/80 p-4 shadow-[0_0_24px_rgba(30,41,59,0.4)] backdrop-blur-sm md:p-5">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-background/60 px-3 py-2 transition-all duration-200 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-400/50">
        <Search className="size-4 text-muted-foreground" />
        <label htmlFor="course-search" className="sr-only">
          Search courses
        </label>
        <input
          id="course-search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search course code, title, or instructor"
          className="h-10 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/80 focus:outline-none"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {POPULAR_SEARCHES.map((term) => (
          <button
            key={term}
            type="button"
            onClick={() => onQueryChange(term)}
            className="h-9 cursor-pointer rounded-full border border-border bg-secondary/50 px-3 text-xs font-medium text-foreground transition-colors duration-200 hover:border-emerald-400/60 hover:bg-emerald-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            {term}
          </button>
        ))}
      </div>

      <ul className="mt-4 space-y-2">
        {courses.length > 0 && query.length > 0 ? (
          courses.map((course) => (
            <li key={course.id}>
              <button
                type="button"
                onClick={() => onAddCourse(course)}
                className="group w-full cursor-pointer rounded-xl border border-border bg-background/50 p-3 text-left transition-all duration-200 hover:border-emerald-400/60 hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm font-semibold text-foreground">{course.id}</p>
                    <p className="text-sm text-muted-foreground">{course.title}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>{course.credits} credits</p>
                    <p>{course.sections.length} sections</p>
                  </div>
                </div>
              </button>
            </li>
          ))
        ) : query.length > 0 ? (
          <li className="rounded-xl border border-dashed border-border bg-background/40 p-4 text-sm text-muted-foreground">
            No matches found, please try a different search.
          </li>
        ) : (
          <li className="rounded-xl border border-dashed border-border bg-background/40 p-4 text-sm text-muted-foreground">
            Try searching for a class by code (e.g., CS 235) or a insturctor (e.g., John).
          </li>
        )
        }
      </ul>
    </section>
  )
}
