import { CheckCircle2, ChevronDown, Circle, Plus } from 'lucide-react'
import { useState } from 'react'

export function MajorTrackerPanel({ requirements = [], completedCourses, onToggleCompleted, onAddCourse }) {
  const [openCategories, setOpenCategories] = useState(new Set())

  const toggleCategory = (cat) => {
    setOpenCategories(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  if (requirements.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center px-4">
        <p className="text-sm font-semibold text-foreground">General Education</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Requirement tracking coming soon. Check off completed courses and get smarter AI suggestions.
        </p>
      </div>
    )
  }

  const completedSet = new Set(completedCourses)

  const completedCredits = requirements
    .filter(r => completedSet.has(r.courseId))
    .reduce((sum, r) => sum + r.credits, 0)

  const totalCredits = requirements.reduce((sum, r) => sum + r.credits, 0)
  const progressPct = totalCredits > 0 ? Math.min(100, Math.round((completedCredits / totalCredits) * 100)) : 0

  const categories = [...new Set(requirements.map(r => r.category))]

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 pb-3">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold text-foreground">General Education</p>
          <p className="text-xs text-muted-foreground">{completedCredits} / {totalCredits} cr</p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-gradient-to-r from-byu-royal to-byu-blue transition-[width] duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="mt-1 text-right text-xs text-muted-foreground">{progressPct}% complete</p>
      </div>

      {/* Requirements list */}
      <div className="flex-1 overflow-y-auto space-y-1">
        {categories.map(category => {
          const reqs = requirements.filter(r => r.category === category)
          const isOpen = openCategories.has(category)
          const catCompleted = reqs.filter(r => completedSet.has(r.courseId)).length

          return (
            <div key={category} className="rounded-xl border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                className="flex w-full items-center justify-between gap-2 bg-secondary/40 px-3 py-2 text-left hover:bg-secondary/60 transition-colors"
              >
                <span className="text-xs font-semibold text-foreground truncate">{category}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted-foreground">{catCompleted}/{reqs.length}</span>
                  <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {isOpen && (
                <ul className="divide-y divide-border/50">
                  {reqs.map(req => {
                    const isDone = completedSet.has(req.courseId)
                    return (
                      <li key={req.courseId} className="flex items-center gap-2 px-3 py-2 hover:bg-secondary/20 transition-colors">
                        <button
                          type="button"
                          onClick={() => onToggleCompleted(req.courseId)}
                          className="shrink-0 text-muted-foreground hover:text-byu-royal transition-colors"
                          aria-label={isDone ? 'Mark incomplete' : 'Mark complete'}
                        >
                          {isDone
                            ? <CheckCircle2 className="size-4 text-green-600" />
                            : <Circle className="size-4" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs font-semibold ${isDone ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                            {req.courseId}
                          </p>
                          {req.title && (
                            <p className="truncate text-xs text-muted-foreground">{req.title}</p>
                          )}
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">{req.credits}cr</span>
                        {!isDone && onAddCourse && (
                          <button
                            type="button"
                            onClick={() => onAddCourse(req.courseId)}
                            className="shrink-0 inline-flex size-6 items-center justify-center rounded-md border border-border text-muted-foreground hover:border-byu-royal hover:text-byu-royal transition-colors"
                            title={`Add ${req.courseId} to schedule`}
                          >
                            <Plus className="size-3.5" />
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
