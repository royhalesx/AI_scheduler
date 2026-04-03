import { CheckCircle2, ChevronDown, Circle, Plus, Upload, Loader2, HelpCircle, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import {
  completedCourseCountsTowardRequirement,
  getRequirementProgress,
  normalizeCourseId,
  requirementOptionId,
} from '@/lib/scheduleUtils'

/** Status icon column + label + trailing meta — no blank “chevron column” so rows stay left-aligned. */
const ROW_GRID = 'grid grid-cols-[1.5rem_minmax(0,1fr)_auto] gap-x-1.5'
const ROW_PAD = 'px-2'

/** BYU MAP-style credits: whole numbers or one decimal (e.g. 72.5). */
function formatAuditCredits(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return '0'
  if (Math.abs(x - Math.round(x)) < 1e-6) return String(Math.round(x))
  return x.toFixed(1).replace(/\.0$/, '')
}

/** e.g. "34/72.5 cr" next to each requirement. */
function requirementProgressLabel(completedCr, requiredCr) {
  const req = Number(requiredCr)
  if (!Number.isFinite(req) || req <= 0) {
    const c = formatAuditCredits(completedCr)
    return Number(completedCr) > 0 ? `${c} cr` : '—'
  }
  return `${formatAuditCredits(completedCr)}/${formatAuditCredits(req)} cr`
}

/** Options that count for this requirement first (exclusive major/minor rules), then alphabetical. */
function sortOptionsByCompletion(opts, getOptionId, req, completedCourses, exclusiveCourseContext) {
  return [...opts].sort((a, b) => {
    const aDone = completedCourseCountsTowardRequirement(req, getOptionId(a), completedCourses, exclusiveCourseContext)
    const bDone = completedCourseCountsTowardRequirement(req, getOptionId(b), completedCourses, exclusiveCourseContext)
    if (aDone !== bDone) return aDone ? -1 : 1
    return getOptionId(a).localeCompare(getOptionId(b))
  })
}

/** Major leaf: MAP line should read as the title, course id as supporting text. */
function preferRequirementLabelFirst(req) {
  if (req.source !== 'major' || (req.options?.length ?? 0) !== 1) return false
  const L = req.label ?? ''
  return (
    /\d+\.?\d*\s+Hrs\s+(Requirement|Option)\b/i.test(L) ||
    /^(?:\d+\.?\d*\s+Hrs\s+)?Requirement\s+\d/i.test(L.trim()) ||
    /^Option\s+\d[\d.]*\b/i.test(L.trim())
  )
}

function RequirementTreeItem({
  req,
  depth,
  completedCourses,
  completedSet,
  exclusiveCourseContext,
  expandedTreeNodes,
  toggleTreeNode,
  expandedOptions,
  toggleOptions,
  onToggleCompleted,
  onAddCourse,
}) {
  const getReqProgress = (r) => getRequirementProgress(r, completedCourses ?? [], exclusiveCourseContext)
  const { isDone, doneBy, completedCredits: rcCr } = getReqProgress(req)
  const hasChildren = req.children?.length > 0
  const treeExpanded = expandedTreeNodes.has(req.id)

  if (hasChildren) {
    const hint = req.aggregate === 'or' ? 'Pick one branch' : 'Complete all nested items'
    return (
      <li className={depth === 0 ? '' : 'mt-0.5'}>
        <div
          className={`${ROW_GRID} min-w-0 items-start ${ROW_PAD} py-2 hover:bg-secondary/20 transition-colors`}
        >
          <span className="flex w-full max-w-[1.5rem] shrink-0 items-start justify-center pt-0.5 text-muted-foreground" title={hint}>
            {isDone
              ? <CheckCircle2 className="size-4 text-green-600" />
              : <Circle className="size-4" />}
          </span>
          <div className="min-w-0">
            <p className={`text-xs font-semibold leading-snug ${isDone ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
              {req.label}
            </p>
            <button
              type="button"
              onClick={() => toggleTreeNode(req.id)}
              className="mt-1 inline-flex max-w-full items-center gap-1 rounded text-left text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              aria-expanded={treeExpanded}
              aria-label={treeExpanded ? 'Collapse nested requirements' : 'Expand nested requirements'}
            >
              <ChevronDown className={`size-3.5 shrink-0 transition-transform ${treeExpanded ? 'rotate-180' : ''}`} />
              <span>{hint}</span>
            </button>
          </div>
          <span className="shrink-0 pt-0.5 text-xs text-muted-foreground tabular-nums">
            {requirementProgressLabel(rcCr, req.credits)}
          </span>
        </div>
        {treeExpanded && (
          <ul className={`mb-1 space-y-0.5 ${ROW_PAD}`}>
            {req.children.map((ch) => (
              <RequirementTreeItem
                key={ch.id}
                req={ch}
                depth={depth + 1}
                completedCourses={completedCourses}
                completedSet={completedSet}
                exclusiveCourseContext={exclusiveCourseContext}
                expandedTreeNodes={expandedTreeNodes}
                toggleTreeNode={toggleTreeNode}
                expandedOptions={expandedOptions}
                toggleOptions={toggleOptions}
                onToggleCompleted={onToggleCompleted}
                onAddCourse={onAddCourse}
              />
            ))}
          </ul>
        )}
      </li>
    )
  }

  const getOptionId = requirementOptionId
  const opts = req.options ?? []
  const isGrouped = opts.length > 1
  const optionsExpanded = expandedOptions.has(req.id)
  const isGe = req.source === 'ge'

  if (opts.length === 0) {
    return (
      <li className={depth === 0 ? '' : 'mt-0.5'}>
        <div className={`${ROW_GRID} ${ROW_PAD} py-2 text-xs text-muted-foreground`}>
          <span className="w-full max-w-[1.5rem] shrink-0" aria-hidden />
          <div className="min-w-0 col-span-2">
            {req.label}
            <span className="ml-2">(no courses parsed)</span>
          </div>
        </div>
      </li>
    )
  }

  return (
    <li className={depth === 0 ? '' : 'mt-0.5'}>
      <div
        className={`${ROW_GRID} min-w-0 items-start ${ROW_PAD} py-2 hover:bg-secondary/20 transition-colors`}
      >
        <button
          type="button"
          onClick={() => {
            if (isGrouped) {
              if (isDone && isGe) {
                onToggleCompleted(doneBy)
              } else {
                toggleOptions(req.id)
              }
            } else {
              const oid = getOptionId(opts[0])
              const n = normalizeCourseId(oid)
              const countsHere = completedCourseCountsTowardRequirement(req, oid, completedCourses ?? [], exclusiveCourseContext)
              const inList = completedSet.has(n)
              if (countsHere) onToggleCompleted(oid)
              else if (!inList) onToggleCompleted(oid)
            }
          }}
          className="flex w-full max-w-[1.5rem] shrink-0 items-start justify-center pt-0.5 text-muted-foreground hover:text-byu-royal transition-colors"
          aria-label={isDone ? 'Mark incomplete' : isGrouped ? 'Show options' : 'Mark complete'}
        >
          {isDone
            ? <CheckCircle2 className="size-4 text-green-600" />
            : <Circle className="size-4" />}
        </button>

        <div className="min-w-0">
          {isGrouped ? (
            <>
              <p className={`text-xs font-semibold ${isDone ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                {req.label}
              </p>
              <button
                type="button"
                onClick={() => toggleOptions(req.id)}
                className={`mt-1 inline-flex items-center gap-1 text-xs transition-colors ${isDone ? 'text-green-600 hover:text-green-500' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <ChevronDown className={`size-3.5 shrink-0 transition-transform ${optionsExpanded ? 'rotate-180' : ''}`} />
                <span>
                  {isDone
                    ? (optionsExpanded ? 'Hide' : (req.source === 'major' ? requirementProgressLabel(rcCr, req.credits) : `Satisfied by ${doneBy}`))
                    : (optionsExpanded ? 'Hide options' : (req.source === 'major' ? `${opts.length} course choices` : `${opts.length} options`))}
                </span>
              </button>
            </>
          ) : preferRequirementLabelFirst(req) ? (
            <>
              <p className={`text-xs font-semibold leading-snug ${isDone ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                {req.label}
              </p>
              <p className={`mt-0.5 font-mono text-xs ${isDone ? 'text-muted-foreground line-through' : 'text-muted-foreground'}`}>
                {getOptionId(opts[0])}
              </p>
            </>
          ) : (
            <>
              <p className={`text-xs font-semibold ${isDone ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                {getOptionId(opts[0])}
              </p>
              {req.label && req.label !== getOptionId(opts[0]) && (
                <p className="truncate text-xs text-muted-foreground">{req.label}</p>
              )}
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-1.5 pt-0.5">
          <span className="text-xs text-muted-foreground tabular-nums">
            {requirementProgressLabel(rcCr, req.credits)}
          </span>
          {!isDone && !isGrouped && onAddCourse && (
            <button
              type="button"
              onClick={() => onAddCourse(getOptionId(opts[0]))}
              className="inline-flex size-6 items-center justify-center rounded-md border border-border text-muted-foreground hover:border-byu-royal hover:text-byu-royal transition-colors"
              title={`Add ${getOptionId(opts[0])} to schedule`}
            >
              <Plus className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {isGrouped && optionsExpanded && (
        <ul className={`mb-1 space-y-0.5 ${ROW_PAD}`}>
          {sortOptionsByCompletion(opts, getOptionId, req, completedCourses ?? [], exclusiveCourseContext).map((optObj) => {
            const opt = getOptionId(optObj)
            const n = normalizeCourseId(opt)
            const optDone = completedCourseCountsTowardRequirement(req, opt, completedCourses ?? [], exclusiveCourseContext)
            const inList = completedSet.has(n)
            return (
              <li key={opt} className="flex items-center gap-1.5 py-0.5">
                <button
                  type="button"
                  onClick={() => {
                    if (optDone) onToggleCompleted(opt)
                    else if (!inList) onToggleCompleted(opt)
                  }}
                  className="shrink-0 text-muted-foreground hover:text-byu-royal transition-colors"
                  aria-label={optDone ? `Unmark ${opt}` : `Mark ${opt} complete`}
                >
                  {optDone
                    ? <CheckCircle2 className="size-3.5 text-green-600" />
                    : <Circle className="size-3.5" />}
                </button>
                <span className={`text-xs font-mono flex-1 ${optDone ? 'text-muted-foreground line-through' : inList ? 'text-muted-foreground/70' : 'text-muted-foreground'}`}>
                  {opt}
                  {inList && !optDone && req.source === 'major' && (
                    <span className="ml-1.5 text-[10px] text-amber-600/90" title="Completed but counts toward another requirement in this program">
                      (used elsewhere)
                    </span>
                  )}
                </span>
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
}

export function MajorTrackerPanel({
  requirements = [],
  /** When set (from PDF Hours Analysis), drives the header totals instead of summing requirement rows. */
  hoursSummary = null,
  /** Primary/minor exclusive course assignment (from SchedulerHome). */
  exclusiveCourseContext = null,
  majorLoaded = false,
  completedCourses = [],
  onToggleCompleted,
  onAddCourse,
  onUploadAudit,
  onRemoveProgress,
}) {
  const [openCategories, setOpenCategories] = useState(new Set())
  const [expandedOptions, setExpandedOptions] = useState(new Set())
  const [expandedTreeNodes, setExpandedTreeNodes] = useState(() => new Set())
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

  const toggleTreeNode = (id) => {
    setExpandedTreeNodes((prev) => {
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

  const completedSet = useMemo(
    () => new Set((completedCourses ?? []).map((c) => normalizeCourseId(c))),
    [completedCourses],
  )

  const getReqProgress = (req) => getRequirementProgress(req, completedCourses ?? [], exclusiveCourseContext)

  const completedCreditsModeled = requirements.reduce((sum, r) => sum + getReqProgress(r).completedCredits, 0)
  const totalCreditsModeled = requirements.reduce((sum, r) => sum + r.credits, 0)

  const completedCredits = hoursSummary?.totalCompleted ?? completedCreditsModeled
  const totalCredits = hoursSummary?.totalRequired ?? totalCreditsModeled
  const progressPct = totalCredits > 0 ? Math.min(100, Math.round((completedCredits / totalCredits) * 100)) : 0

  const categories = [...new Set(requirements.map(r => r.category))]

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 pb-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">Degree Progress</p>
          <p className="text-xs text-muted-foreground tabular-nums">{completedCredits} / {totalCredits} cr</p>
        </div>
        {hoursSummary?.minorRequired != null && hoursSummary?.minorCompleted != null && (
          <p className="mt-0.5 text-right text-[10px] text-muted-foreground tabular-nums">
            Minor (Civic Engagement): {hoursSummary.minorCompleted} / {hoursSummary.minorRequired} cr
          </p>
        )}
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
                  {reqs.map((req) => (
                    <RequirementTreeItem
                      key={req.id}
                      req={req}
                      depth={0}
                      completedCourses={completedCourses}
                      completedSet={completedSet}
                      exclusiveCourseContext={exclusiveCourseContext}
                      expandedTreeNodes={expandedTreeNodes}
                      toggleTreeNode={toggleTreeNode}
                      expandedOptions={expandedOptions}
                      toggleOptions={toggleOptions}
                      onToggleCompleted={onToggleCompleted}
                      onAddCourse={onAddCourse}
                    />
                  ))}
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
