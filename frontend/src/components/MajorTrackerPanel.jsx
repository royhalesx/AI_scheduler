import { CheckCircle2, ChevronDown, Circle, Plus, Upload, Loader2, HelpCircle, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { getRequirementProgress, requirementOptionId } from '@/lib/scheduleUtils'

export function MajorTrackerPanel({
  requirements = [],
  majorLoaded = false,
  completedCourses,
  onToggleCompleted,
  onAddCourse,
  onUploadAudit,
  onRemoveProgress,
}) {
  const [openCategories, setOpenCategories] = useState(new Set())
  const [expandedOptions, setExpandedOptions] = useState(new Set())
  const [isParsing, setIsParsing] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const fileInputRef = useRef(null)

  const toggleCategory = (cat) => {
    setOpenCategories(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  const toggleOptions = (id) => {
    setExpandedOptions(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsParsing(true)
    try {
      await onUploadAudit(file)
    } finally {
      setIsParsing(false)
      e.target.value = ''
    }
  }

  const getOptionId = requirementOptionId
  const getReqProgress = (req) => getRequirementProgress(req, completedCourses)

  const completedCredits = requirements.reduce((sum, r) => sum + getReqProgress(r).completedCredits, 0)

  const totalCredits = requirements.reduce((sum, r) => sum + r.credits, 0)
  const progressPct = totalCredits > 0 ? Math.min(100, Math.round((completedCredits / totalCredits) * 100)) : 0

  const categories = [...new Set(requirements.map(r => r.category))]

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 pb-3">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold text-foreground">Degree Progress</p>
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

      {/* Upload prompt for major requirements */}
      {!majorLoaded && (
        <div className="shrink-0 mb-3 rounded-xl border border-dashed border-border bg-secondary/30 p-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-foreground">Upload Degree Progress</p>
            <button
              onClick={() => setShowHelp(true)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="How to find your degree progress"
            >
              <HelpCircle className="size-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
            Upload your BYU degree progress PDF to track major requirements and get smarter AI suggestions.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            disabled={isParsing}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-byu-royal hover:text-byu-royal disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isParsing
              ? <><Loader2 className="size-3.5 animate-spin" /> Parsing…</>
              : <><Upload className="size-3.5" /> Choose PDF</>
            }
          </button>
        </div>
      )}

      {/* Requirements list */}
      <div className="flex-1 overflow-y-auto space-y-1">
        {categories.map(category => {
          const reqs = requirements.filter(r => r.category === category)
          const isOpen = openCategories.has(category)
          const catCompleted = reqs.filter(r => getReqProgress(r).isDone).length

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
                    const { isDone, doneBy, completedCredits: rcCr } = getReqProgress(req)
                    const isGrouped = req.options.length > 1
                    const optionsExpanded = expandedOptions.has(req.id)

                    return (
                      <li key={req.id} className="px-3 py-2 hover:bg-secondary/20 transition-colors">
                        <div className="flex items-center gap-2">
                          {/* Checkbox — for major reqs toggle the specific course; for GE toggle satisfied or expand options */}
                          <button
                            type="button"
                            onClick={() => {
                              if (isGrouped) {
                                if (isDone && req.source === 'ge') {
                                  onToggleCompleted(doneBy)
                                } else {
                                  toggleOptions(req.id)
                                }
                              } else {
                                onToggleCompleted(getOptionId(req.options[0]))
                              }
                            }}
                            className="shrink-0 text-muted-foreground hover:text-byu-royal transition-colors"
                            aria-label={isDone ? 'Mark incomplete' : isGrouped ? 'Show options' : 'Mark complete'}
                          >
                            {isDone
                              ? <CheckCircle2 className="size-4 text-green-600" />
                              : <Circle className="size-4" />
                            }
                          </button>

                          <div className="min-w-0 flex-1">
                            {isGrouped ? (
                              <>
                                <p className={`text-xs font-semibold ${isDone ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                                  {req.label}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => toggleOptions(req.id)}
                                  className={`text-xs transition-colors ${isDone ? 'text-green-600 hover:text-green-500' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                  {isDone
                                    ? (optionsExpanded ? 'Hide ▴' : (req.source === 'major' ? `${rcCr}/${req.credits}cr satisfied ▾` : `Satisfied by ${doneBy} ▾`))
                                    : (optionsExpanded ? 'Hide options ▴' : (req.source === 'major' ? `${rcCr}/${req.credits}cr satisfied ▾` : `${req.options.length} options ▾`))
                                  }
                                </button>
                              </>
                            ) : (
                              <>
                                <p className={`text-xs font-semibold ${isDone ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                                  {getOptionId(req.options[0])}
                                </p>
                                {req.label && req.label !== getOptionId(req.options[0]) && (
                                  <p className="truncate text-xs text-muted-foreground">{req.label}</p>
                                )}
                              </>
                            )}
                          </div>

                          <span className="shrink-0 text-xs text-muted-foreground">{req.credits}cr</span>

                          {/* Add to schedule — only for single option reqs that aren't done */}
                          {!isDone && !isGrouped && onAddCourse && (
                            <button
                              type="button"
                              onClick={() => onAddCourse(getOptionId(req.options[0]))}
                              className="shrink-0 inline-flex size-6 items-center justify-center rounded-md border border-border text-muted-foreground hover:border-byu-royal hover:text-byu-royal transition-colors"
                              title={`Add ${getOptionId(req.options[0])} to schedule`}
                            >
                              <Plus className="size-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Expandable options list for grouped reqs */}
                        {isGrouped && optionsExpanded && (
                          <ul className="mt-1.5 ml-6 space-y-0.5">
                            {req.options.map(optObj => {
                              const opt = getOptionId(optObj)
                              const optDone = completedSet.has(opt)
                              return (
                                <li key={opt} className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => onToggleCompleted(opt)}
                                    className="shrink-0 text-muted-foreground hover:text-byu-royal transition-colors"
                                    aria-label={optDone ? `Unmark ${opt}` : `Mark ${opt} complete`}
                                  >
                                    {optDone
                                      ? <CheckCircle2 className="size-3.5 text-green-600" />
                                      : <Circle className="size-3.5" />
                                    }
                                  </button>
                                  <span className={`text-xs font-mono flex-1 ${optDone ? 'text-muted-foreground line-through' : 'text-muted-foreground'}`}>{opt}</span>
                                  {!optDone && onAddCourse && (
                                    <button
                                      type="button"
                                      onClick={() => onAddCourse(opt)}
                                      className="shrink-0 inline-flex size-5 items-center justify-center rounded border border-border text-muted-foreground hover:border-byu-royal hover:text-byu-royal transition-colors"
                                      title={`Add ${opt} to schedule`}
                                    >
                                      <Plus className="size-3" />
                                    </button>
                                  )}
                                </li>
                              )
                            })}
                          </ul>
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

      {/* Re-upload link if major is already loaded */}
      {majorLoaded && (
        <div className="shrink-0 pt-2 flex flex-col items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            disabled={isParsing}
            onClick={() => fileInputRef.current?.click()}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {isParsing ? 'Parsing…' : 'Re-upload degree progress'}
          </button>
          {onRemoveProgress && (
            <button
              type="button"
              onClick={onRemoveProgress}
              className="text-xs text-red-400 hover:text-red-500 transition-colors"
            >
              Remove progress
            </button>
          )}
        </div>
      )}

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-card border border-border rounded-xl shadow-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm">How to get your Degree Progress PDF</h3>
              <button
                onClick={() => setShowHelp(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
              <div className="space-y-2">
                <p className="text-sm font-medium">Step 1: Go to <a href="https://mymap.byu.edu/" target="_blank" rel="noreferrer" className="text-byu-royal underline hover:opacity-80">mymap.byu.edu</a> and navigate to the Progress Report page.</p>
                <div className="w-full rounded-lg overflow-hidden border border-border">
                  <img src="/images/myMap.png" alt="Step 1" className="w-full h-auto object-cover" />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Step 2: Click <strong>Generate Report</strong>, then save or print it as a PDF and upload it here.</p>
                <div className="w-full rounded-lg overflow-hidden border border-border">
                  <img src="/images/generateReport.png" alt="Step 2" className="w-full h-auto object-cover" />
                </div>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-border flex justify-end">
              <button
                onClick={() => setShowHelp(false)}
                className="bg-byu-royal text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-byu-blue transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
