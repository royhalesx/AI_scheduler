import * as pdfjsLib from 'pdfjs-dist'
import { normalizeCourseId as catalogCourseKey } from './scheduleUtils'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

export interface ParsedRequirementOption {
  id: string
  credits: number
}

export interface ParsedRequirement {
  id: string
  label: string
  category: string
  credits: number
  options: ParsedRequirementOption[]
  /** Tracks which PDF section this came from (merged into `source: 'ge' | 'major'` in the app). */
  auditSection?: 'ge' | 'major'
  children?: ParsedRequirement[]
  aggregate?: 'or' | 'and'
}

/** From the PDF “Hours Analysis” table (source of truth for degree totals). */
export interface DegreeHoursSummary {
  totalRequired: number
  totalCompleted: number
  /** “Civic Engagement” / other-programs minor row when present. */
  minorRequired?: number
  minorCompleted?: number
}

export interface ParsedDegreeAudit {
  major: string
  totalCredits: number
  /** When present, matches BYU “Total Hours” / minor rows — use for progress UI instead of summing requirement rows. */
  hoursSummary: DegreeHoursSummary | null
  /** Top-level MAP requirement trees (each may nest Options → Requirements → course pools). */
  requirements: ParsedRequirement[]
  completedCourses: string[]
}

interface BuildNode {
  id: string
  path: number[]
  rowKind: 'requirement' | 'option'
  label: string
  category: string
  credits: number
  auditSection: 'major'
  children: BuildNode[]
  options: ParsedRequirementOption[]
  /** Monotonic document order for this node (fixes PDF lines where the stack advances before a course row). */
  seq: number
  /** Program band from PDF (increments at each real section header) so Requirement 4 in a minor ≠ primary Requirement 4. */
  sectionSeq: number
}

/** True for MAP “Complete 1 Course” (exactly one course), not “Complete 1 of N …”. */
function isStrictSingleCourseSlotLabel(label: string): boolean {
  if (/Complete\s+1\s+of\b/i.test(label)) return false
  return /Complete\s+1\s+Course\b/i.test(label)
}

function walkBuildNodeDeep(n: BuildNode, fn: (n: BuildNode) => void) {
  fn(n)
  for (const c of n.children) walkBuildNodeDeep(c, fn)
}

function walkMajorBuildRoots(roots: BuildNode[], fn: (n: BuildNode) => void) {
  for (const r of roots) walkBuildNodeDeep(r, fn)
}

/** Earliest-declared strict single-course leaf that still has no course option (same MAP section only). */
function findEarliestEmptyStrictSingleLeaf(roots: BuildNode[], sectionSeq: number): BuildNode | null {
  let best: BuildNode | null = null
  walkMajorBuildRoots(roots, (n) => {
    if (n.sectionSeq !== sectionSeq) return
    if (n.children.length > 0) return
    if (!isStrictSingleCourseSlotLabel(n.label) || n.options.length > 0) return
    if (!best || n.seq < best.seq) best = n
  })
  return best
}

/**
 * Prefer filling an older “Complete 1 Course” slot before attaching to a newer pool row
 * when PDF order leaves the stack on Requirement N+1 before POLI 200 is read.
 */
function chooseMajorCourseAttachmentTarget(
  majorRoots: BuildNode[],
  stackTop: BuildNode | null,
  currentSectionSeq: number,
): BuildNode | null {
  const scopeSeq = stackTop?.sectionSeq ?? currentSectionSeq
  const needy = findEarliestEmptyStrictSingleLeaf(majorRoots, scopeSeq)
  if (!stackTop) return needy

  if (!needy || needy === stackTop) return stackTop

  const topIsStrictEmpty =
    isStrictSingleCourseSlotLabel(stackTop.label) && stackTop.options.length === 0
  const topIsStrictFull =
    isStrictSingleCourseSlotLabel(stackTop.label) && stackTop.options.length >= 1
  const topIsPoolOrMulti =
    !isStrictSingleCourseSlotLabel(stackTop.label) || /Complete\s+\d+\s+of\b/i.test(stackTop.label)

  if (topIsPoolOrMulti || topIsStrictFull) return needy
  if (topIsStrictEmpty) return needy.seq <= stackTop.seq ? needy : stackTop
  return stackTop
}

function buildNodeToParsed(n: BuildNode): ParsedRequirement {
  const aggregate =
    n.children.length > 0
      ? n.children.every((c) => c.rowKind === 'option')
        ? 'or'
        : n.children.every((c) => c.rowKind === 'requirement')
          ? 'and'
          : 'and'
      : undefined
  const children = n.children.map(buildNodeToParsed)
  return {
    id: n.id,
    label: n.label,
    category: n.category,
    credits: n.credits,
    options: n.options,
    auditSection: n.auditSection,
    children: children.length ? children : undefined,
    aggregate,
  }
}

function pruneEmpty(n: ParsedRequirement): ParsedRequirement | null {
  const kids = n.children?.map(pruneEmpty).filter((x): x is ParsedRequirement => x !== null) ?? []
  if (kids.length === 0 && n.options.length === 0) {
    // Keep MAP requirement rows even with no parsed courses so minors / late rows still show in the UI.
    if (
      n.auditSection === 'major' &&
      /\b(?:Requirement|Option)\s+[\d.]+/i.test(n.label)
    ) {
      return { ...n, children: undefined }
    }
    return null
  }
  return { ...n, children: kids.length ? kids : undefined }
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Final grades that confirm a course is done.
// Excludes W (withdrawal), I (incomplete), NP, IP which mean NOT done.
const COMPLETED_GRADE_RE = /\b(A[+-]?|B[+-]?|C[+-]?|D[+-]?|P|CR|WVR)\b/

// A semester enrollment date without a grade also counts as completed,
// but ONLY when the line contains exactly the pattern "(Winter|Fall|Spring|Summer) Semester 20XX"
// with no "Planned" qualifier (Planned = not yet taken).
const SEMESTER_TAKEN_RE = /\b(Winter|Fall|Spring|Summer)\s+Semester\s+20\d{2}\b/i

function isSemesterCompleted(line: string): boolean {
  return SEMESTER_TAKEN_RE.test(line) && !/\bPlanned\b/i.test(line)
}

// BYU 3-digit course ID pattern.
// Handles: "CS 235", "EC EN 224", "REL A 275", "MATH 112", "IT&C 567", "PHSCS 121"
// Also handles PDF quirk where "CS" is written "C S" (space between single letters).
const COURSE_ID_RE = /\b([A-Z][A-Z&]{0,5}(?:\s[A-Z]{1,2})?)\s{1,3}(\d{3}[A-Z]?)\b/g

// ─── Section boundary patterns (work for any BYU major) ──────────────────────

// Main section header: "Computer Engineering (BS) Requirements — Not Completed"
//                      "Entrepreneurship (Minor) Requirements — In Progress"  ← optional (Minor) before Requirements
//                      "Individual and Society - American Heritage Requirements — In Progress"
// Exclude lines that are nested MAP rows: "6.0 Hrs Option 1.1 — …", "1.0 Hr Requirement 4 — …"
// Use plural "Requirements" only — notes like "the … requirement: POLI 301…" must not match.
// Accept en dash, em dash, ASCII hyphen, or colon before status.
const SECTION_HEADER_RE =
  /^(?!.*\d+\.?\d*\s+Hrs?\s+(?:Requirement|Option)\s)(.+?)\s*(?:\([^)]+\)\s*)?(?:MINOR\s+)?Requirements\s*[—–\-:]/i

/** True for real program / GE band headers; false for mid-major blurbs (e.g. "Analytical and Professional Skills Requirements —"). */
function isPrimarySectionHeaderLine(trimmed: string): boolean {
  return (
    /PRIMARY\b/i.test(trimmed) ||
    /^Minor\s+in\b/i.test(trimmed) ||
    /\bMINOR\s+Requirements\b/i.test(trimmed) ||
    /\(Minor\)\s+Requirements\b/i.test(trimmed) ||
    /\([A-Z]{2,4}\)\s+Requirements\b/i.test(trimmed) ||
    /General Education|University Core\b/i.test(trimmed) ||
    /^Religion\s+Requirements\b/i.test(trimmed) ||
    /^Skills\b/i.test(trimmed) ||
    /Individual and Society|American Heritage|Global and Cultural|First-Year Writing|Written and Oral|Arts, Letters/i.test(
      trimmed,
    )
  )
}

// Sub-requirement headers — never contain extractable course data
// "72.5 Hrs Requirement 1 — Complete 23 Courses — ..."
// "6.0 Hrs Option 1.1 — Complete 2"
// "3.0 Hrs Requirement 1.1.2 — Complete 1 of 4 Courses"
// "1.0 Hr Requirement 4 — …" (BYU uses singular "Hr" for 1-credit rows)
// "Requirement 4" (PDF may omit trailing em dash / prose on a lone header line)
const SUB_REQ_RE =
  /^(?:\d+\.?\d*\s+Hrs?\s+)?(?:Requirement|Option)\s+[\d.]+\s*(?:[—–-].*)?$/i

// A line that is only a letter grade (PDF stacks these above “Satisfied by …” rows).
const STANDALONE_GRADE_LINE_RE =
  /^(A\+|A-|A|B\+|B-|B|C\+|C-|C|D\+|D-|D|E|P|W|I|T|NR|IP|CR)\s*$/i

// Lines that are instructions / footnotes — may contain course IDs incidentally
// "Note: WRTG 312 recommended."
// "You may take up to 3.0 credit hours"
// "Complete at least 12 credit hours of TECHNICAL ELECTIVES..."
// "Courses used to fulfill Requirement 3 cannot be used..."
// "This course is no longer available for registration..."
// `(Note:` — MAP footnotes often start with a parenthesis before "Note:".
const NOTE_LINE_RE =
  /^(?:\(?Note:|You may take|Complete at least|Complete a total|Courses used|Technical Electives?:|no longer available|possible substitutions|Obtain confirmation|Earn at least|This course is)/i

// The "Classes" section (semester-by-semester history) starts with one of these.
// Once seen, we stop — everything after is already-taken class history, not requirements.
const CLASSES_STOP_RE = /^Classes\s*$|^(Spring|Winter|Fall|Summer)\s+(Term|Semester)\s+\d{4}\s+---/i

/** MAP/PDF splits credits and progress onto the next line — glue them for parsing. */
function mergeAuditLineFragments(lines: string[]): string[] {
  const out: string[] = []
  const continuationOnly = (t: string) =>
    /^\d+(?:\.\d+)?\s*cr\s*$/i.test(t) ||
    /^\d+\/\d+$/.test(t) ||
    /^\d+\/\d+cr\b/i.test(t) ||
    /^satisfied\b/i.test(t) ||
    /^[▾▼]\s*$/.test(t) ||
    /^(?:▾|▼)\s*$/u.test(t) ||
    /^of\s+\d+\s+Courses?\s*$/i.test(t)

  for (const raw of lines) {
    const t = raw.trim()
    if (!t) continue
    if (continuationOnly(t) && out.length > 0) {
      out[out.length - 1] = `${out[out.length - 1]} ${t}`
    } else {
      out.push(t)
    }
  }
  return out
}

function sectionSourceFromCategory(cat: string): 'ge' | 'major' {
  const c = cat.toLowerCase()
  if (
    c.includes('general education') ||
    c.includes('university core') ||
    /^religion\b/.test(c) ||
    c.includes('american heritage') ||
    c.includes('global and cultural') ||
    c.includes('first-year writing') ||
    c.includes('written and oral') ||
    c.includes('civic engagement literacy') ||
    c.includes('individual and society') ||
    c.includes('arts, letters, and sciences') ||
    (c.includes('minor') && /society|heritage|ge\s|breadth/i.test(c))
  )
    return 'ge'
  return 'major'
}

function cleanSubReqLabel(trimmed: string): string {
  return trimmed
    .replace(/\s+—\s+\(Completed[\s\S]*$/i, '')
    .replace(/\s+—\s+Complete\s*$/i, '')
    .replace(/\s+\d+\/\d+\s*cr\s*satisfied[\s▾▼]*$/i, '')
    .replace(/\s*▾\s*|\s*▼\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** MAP dotted id after "Requirement" / "Option" → numeric path (Requirement 6.1.2 → [6,1,2]). */
function parseDottedReqPath(trimmed: string): number[] | null {
  const m = trimmed.match(/(?:Requirement|Option)\s+([\d.]+)\b/i)
  if (!m) return null
  return m[1].split('.').map((x) => parseInt(x, 10))
}

function pathsEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

/** True if `prefix` is a prefix of `full` (same first N coords, N = prefix.length). */
function pathPrefixEq(prefix: number[], full: number[]): boolean {
  return prefix.length <= full.length && prefix.every((v, i) => v === full[i])
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * BYU's PDF writes "C S" (with space) for the CS dept and "G E" for GE.
 * Merge single-letter + single-letter depts, then normalize to match catalog keys
 * (e.g. "EC EN 224" → "ECEN 224", "REL A 275" → "RELA 275").
 */
function normalizeCourseId(dept: string, num: string): string {
  const d = /^[A-Z] [A-Z]$/.test(dept.trim()) ? dept.replace(/\s/, '') : dept.trim()
  return catalogCourseKey(`${d} ${num}`.trim())
}

function extractFirstCourse(line: string): { courseId: string; index: number; fullMatch: string } | null {
  COURSE_ID_RE.lastIndex = 0
  const m = COURSE_ID_RE.exec(line)
  if (!m) return null
  const deptCollapsed = m[1].replace(/\s+/g, '')
  // Reject "N 400" style street numbers (dept token collapses to one letter).
  if (deptCollapsed.length < 2) return null
  return { courseId: normalizeCourseId(m[1], m[2]), index: m.index!, fullMatch: m[0] }
}

/**
 * True if the first course on the line is a MAP row (dept + number near the start / satisfied row),
 * not an incidental mention in a footnote like "after POLI 200 because" or "(Note: … POLI 328 …".
 */
function isStandaloneCourseListingLine(
  courseScanLine: string,
  matchIndex: number,
  fromSatisfiedBy: boolean,
): boolean {
  if (fromSatisfiedBy) return true
  const noteIdx = courseScanLine.search(/\(Note:/i)
  if (noteIdx >= 0 && matchIndex > noteIdx) return false
  // Real listing lines put the course ID in the first ~55 chars; prose continuations mention it later.
  if (matchIndex > 55) return false
  const before = courseScanLine.slice(0, matchIndex).trimEnd()
  if (/\b(?:after|before|than|(?:in\s+)?combination\s+with)\s+$/i.test(before)) return false
  return true
}

/**
 * Emma-style MAP puts long course titles on two PDF rows, e.g.
 *   "POLI 150 Comparative3.0" / "Governmnt&Politics"
 * Merge so we do not treat the second row as a meaningless line.
 */
function mergeTitleContinuationLines(lines: string[]): string[] {
  const out: string[] = []
  for (const raw of lines) {
    const t = raw.trim()
    if (!t) continue
    if (out.length === 0) {
      out.push(t)
      continue
    }
    const prev = out[out.length - 1]
    const lineHasCourse = extractFirstCourse(t) !== null
    const prevHasCourse = extractFirstCourse(prev) !== null
    const looksLikeTitleTail =
      !lineHasCourse &&
      !SECTION_HEADER_RE.test(t) &&
      !SUB_REQ_RE.test(t) &&
      !/^\d+(?:\.\d+)?\s+Hrs?\b/i.test(t) &&
      !NOTE_LINE_RE.test(t) &&
      !CLASSES_STOP_RE.test(t) &&
      t.length < 90 &&
      !/^\d+\/\d+$/.test(t) &&
      !/^\d+(?:\.\d+)?\s*cr\b/i.test(t) &&
      !/^Page \d+$/i.test(t) &&
      !/\bProgram:\b/i.test(t) &&
      !/\bEntered:\s+/i.test(t) &&
      !/Provo,?\s+UT/i.test(t) &&
      !/\bUnit\s+[A-Z]?\d*\b/i.test(t)

    if (prevHasCourse && looksLikeTitleTail) {
      out[out.length - 1] = `${prev} ${t}`
    } else {
      out.push(t)
    }
  }
  return out
}

function guessMajor(lines: string[]): string {
  for (const line of lines.slice(0, 60)) {
    // "Program: PRIMARY Political Science (BA)" — don't swallow "Entered: ..." if merged onto one line
    const m = line.match(/Program:\s*(?:PRIMARY\s+)?(.+?)(?:\s*---|\s+Entered:|$)/i)
    if (m) return m[1].replace(/^PRIMARY\s+/i, '').trim()
  }
  return ''
}

/**
 * Parses the Hours Analysis block: "Total Hours 138.0 99.0 …" and optional Civic Engagement minor row.
 * Collapses whitespace so split PDF lines like "Civic Engag" / "ement18.0" still match.
 */
export function parseHoursAnalysis(lines: string[]): DegreeHoursSummary | null {
  const flat = lines.join(' ').replace(/\s+/g, ' ')
  const totalMatch = flat.match(/Total Hours\s+([\d.]+)\s+([\d.]+)/i)
  if (!totalMatch) return null
  const totalRequired = Math.round(parseFloat(totalMatch[1]))
  const totalCompleted = Math.round(parseFloat(totalMatch[2]))
  if (totalRequired < 30 || totalRequired > 400) return null
  const out: DegreeHoursSummary = { totalRequired, totalCompleted }
  const minorMatch = flat.match(/Civic Engag[^0-9]*(\d+\.?\d*)\s+(\d+\.?\d*)/i)
  if (minorMatch) {
    const mr = Math.round(parseFloat(minorMatch[1]))
    const mc = Math.round(parseFloat(minorMatch[2]))
    if (mr >= 0 && mr <= 60) {
      out.minorRequired = mr
      out.minorCompleted = mc
    }
  }
  return out
}

function guessTotalCreditsFallback(lines: string[]): number {
  for (const line of lines) {
    const m = line.match(/Total Hours\s+([\d.]+)/)
    if (m) {
      const n = parseFloat(m[1])
      if (n >= 60 && n <= 300) return Math.round(n)
    }
  }
  return 120 // BYU default
}

// ─── Main export ─────────────────────────────────────────────────────────────

async function extractPdfTextLines(file: File): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const allLines: string[] = []

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()

    const byY = new Map<number, Array<{ x: number; str: string }>>()
    for (const item of content.items) {
      if (!('str' in item)) continue
      const it = item as { str: string; transform: number[] }
      const y = Math.round(it.transform[5] / 2) * 2
      const row = byY.get(y) ?? []
      row.push({ x: it.transform[4], str: it.str })
      byY.set(y, row)
    }

    const sortedYs = [...byY.keys()].sort((a, b) => b - a)
    for (const y of sortedYs) {
      const row = byY.get(y)!.sort((a, b) => a.x - b.x)
      const line = row.map((i) => i.str).join('').replace(/\s{2,}/g, ' ').trim()
      if (line) allLines.push(line)
    }
  }

  return allLines
}

/** Parse pre-extracted lines (tests / tooling). Applies MAP line-fragment merging. */
export function parseDegreeAuditFromLines(rawLines: string[]): ParsedDegreeAudit {
  const lines = mergeTitleContinuationLines(mergeAuditLineFragments(rawLines))
  const major = guessMajor(lines)
  const hoursSummary = parseHoursAnalysis(lines)
  const totalCredits = hoursSummary?.totalRequired ?? guessTotalCreditsFallback(lines)

  const fullText = lines.join('\n')
  const FINGERPRINTS = [
    /Requirements?\s*[—–\-:]/i,
    /\bDegree\s+(?:Audit|Progress)\b/i,
    /\b(?:BYU|Brigham\s+Young\s+University)\b/i,
    /\bGPA\b/i,
    /\bCredit\s+Hours?\b/i,
  ]
  const matched = FINGERPRINTS.filter((re) => re.test(fullText)).length
  if (matched < 2) {
    throw new Error(
      'This PDF does not appear to be a BYU degree progress report. ' +
        'Please follow the instructions in the help panel to download your progress report from mymap.byu.edu.',
    )
  }

  const majorRoots: BuildNode[] = []
  let nodeStack: BuildNode[] = []
  const pendingMajorCourses: ParsedRequirementOption[] = []
  const completedCourses = new Set<string>()
  let currentCategory = ''
  let currentSectionSource: 'ge' | 'major' = 'major'
  /** Bumps on each accepted program/GE-band header so MAP path numbers reset per section without false duplicate merges. */
  let majorSectionSeq = 0
  let reqIdCounter = 0
  let buildSeq = 0

  const attachPendingToNewMajorNode = (newNode: BuildNode, labelTextClean: string) => {
    if (pendingMajorCourses.length === 0) return
    if (isStrictSingleCourseSlotLabel(labelTextClean)) {
      for (const o of pendingMajorCourses) {
        if (!newNode.options.some((x) => x.id === o.id)) newNode.options.push(o)
      }
      pendingMajorCourses.length = 0
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (CLASSES_STOP_RE.test(trimmed)) {
      if (pendingMajorCourses.length > 0) {
        for (const o of pendingMajorCourses) {
          majorRoots.push({
            id: `major-req-${++reqIdCounter}`,
            path: [],
            rowKind: 'requirement',
            label: o.id,
            category: currentCategory || 'Requirements',
            credits: o.credits,
            auditSection: 'major',
            children: [],
            options: [o],
            seq: ++buildSeq,
            sectionSeq: majorSectionSeq,
          })
        }
        pendingMajorCourses.length = 0
      }
      break
    }

    const sectionMatch = trimmed.match(SECTION_HEADER_RE)
    if (sectionMatch) {
      let cat = sectionMatch[1].replace(/^PRIMARY\s+/i, '').trim()
      if (/MINOR/i.test(trimmed)) cat += ' (Minor)'

      // MAP inserts subsection titles that look like section headers; do not split the major tree or category.
      if (currentSectionSource === 'major' && majorRoots.length > 0 && !isPrimarySectionHeaderLine(trimmed)) {
        continue
      }

      if (pendingMajorCourses.length > 0) {
        for (const o of pendingMajorCourses) {
          majorRoots.push({
            id: `major-req-${++reqIdCounter}`,
            path: [],
            rowKind: 'requirement',
            label: o.id,
            category: currentCategory || 'Requirements',
            credits: o.credits,
            auditSection: 'major',
            children: [],
            options: [o],
            seq: ++buildSeq,
            sectionSeq: majorSectionSeq,
          })
        }
        pendingMajorCourses.length = 0
      }

      majorSectionSeq++
      currentCategory = cat
      currentSectionSource = sectionSourceFromCategory(cat)
      nodeStack.length = 0
      continue
    }

    const subReqMatch = trimmed.match(SUB_REQ_RE)
    if (subReqMatch) {
      // General Education is tracked via static `GE_REQUIREMENTS`; still parse courses below for completions.
      if (currentSectionSource === 'ge') {
        nodeStack.length = 0
        continue
      }

      let reqCredits = 3
      const hrsMatch = trimmed.match(/^(\d+\.?\d*)\s+Hrs?/i)
      if (hrsMatch) reqCredits = parseFloat(hrsMatch[1])

      const labelText = cleanSubReqLabel(trimmed)
      const parsedPath = parseDottedReqPath(trimmed)
      const rowKind: 'option' | 'requirement' = /^(?:\d+\.?\d*\s+Hrs?\s+)?Option\s+/i.test(trimmed)
        ? 'option'
        : 'requirement'

      if (parsedPath && parsedPath.length > 0) {
        let duplicateHeader = false
        while (nodeStack.length > 0) {
          const top = nodeStack[nodeStack.length - 1]!
          if (pathsEqual(top.path, parsedPath) && top.sectionSeq === majorSectionSeq) {
            top.label = labelText
            top.credits = reqCredits
            top.rowKind = rowKind
            duplicateHeader = true
            break
          }
          if (pathPrefixEq(top.path, parsedPath) && top.path.length < parsedPath.length) break
          nodeStack.pop()
        }
        if (duplicateHeader) continue

        const newNode: BuildNode = {
          id: `major-req-${++reqIdCounter}`,
          path: parsedPath,
          rowKind,
          label: labelText,
          category: currentCategory || 'Requirements',
          credits: reqCredits,
          auditSection: 'major',
          children: [],
          options: [],
          seq: ++buildSeq,
          sectionSeq: majorSectionSeq,
        }
        if (nodeStack.length === 0) {
          majorRoots.push(newNode)
        } else {
          nodeStack[nodeStack.length - 1]!.children.push(newNode)
        }
        nodeStack.push(newNode)
        attachPendingToNewMajorNode(newNode, labelText)
      } else {
        nodeStack.length = 0
        const newNode: BuildNode = {
          id: `major-req-${++reqIdCounter}`,
          path: [],
          rowKind,
          label: labelText,
          category: currentCategory || 'Requirements',
          credits: reqCredits,
          auditSection: 'major',
          children: [],
          options: [],
          seq: ++buildSeq,
          sectionSeq: majorSectionSeq,
        }
        majorRoots.push(newNode)
        nodeStack.push(newNode)
        attachPendingToNewMajorNode(newNode, labelText)
      }
      continue
    }

    if (NOTE_LINE_RE.test(trimmed)) continue
    if (/^(Complete|Not Completed|In Progress|Planned|Deficient|Completed)\s*$/i.test(trimmed)) continue
    if (/^Ben |^Page \d+$|^Brigham Young University|^Progress to Degree/.test(trimmed)) continue
    if (/^(?:▾|▼)\s*$/.test(trimmed)) continue
    if (STANDALONE_GRADE_LINE_RE.test(trimmed)) continue

    // Address / header junk (e.g. "… W Unit H1 Provo, UT 84604… Program: PRIMARY …")
    if (/\bProgram:\s*/i.test(trimmed)) continue
    if (/\bEntered:\s+/i.test(trimmed)) continue
    if (/Provo,?\s+UT\b/i.test(trimmed)) continue
    if (/\b8460\d{2}\b/.test(trimmed)) continue
    if (/\bUnit\s+[A-Z]?\d+[a-z]?\b/i.test(trimmed)) continue

    let courseScanLine = trimmed
    let fromSatisfiedBy = false
    const satByPrefix = trimmed.match(/^Satisfied by\s+/i)
    if (satByPrefix) {
      fromSatisfiedBy = true
      courseScanLine = trimmed
        .slice(satByPrefix[0].length)
        .replace(/[▾▼]\s*$/u, '')
        .trim()
      if (!courseScanLine) continue
    }

    const match = extractFirstCourse(courseScanLine)
    if (!match) continue

    if (!isStandaloneCourseListingLine(courseScanLine, match.index, fromSatisfiedBy)) continue

    const { courseId, index, fullMatch } = match

    const beforeId = courseScanLine.slice(0, index)
    const afterId = courseScanLine.slice(index + fullMatch.length)
    const creditsBeforeMatch = beforeId.match(/\b(\d+\.\d+)\s*$/)
    const creditsAfterMatch = afterId.match(/^\s*[-–]?\s*\w[^.]*?(\d+\.\d+)/)
    const credits = creditsBeforeMatch
      ? parseFloat(creditsBeforeMatch[1])
      : creditsAfterMatch
        ? parseFloat(creditsAfterMatch[1])
        : 3

    if (fromSatisfiedBy || COMPLETED_GRADE_RE.test(afterId) || /In Progress/i.test(afterId) || isSemesterCompleted(courseScanLine)) {
      completedCourses.add(courseId)
    }

    if (currentSectionSource === 'ge') continue

    const stackTop = nodeStack.length > 0 ? nodeStack[nodeStack.length - 1]! : null
    const target = chooseMajorCourseAttachmentTarget(majorRoots, stackTop, majorSectionSeq)
    if (target) {
      if (target.options.some((o) => o.id === courseId)) continue
      target.options.push({ id: courseId, credits })
    } else {
      pendingMajorCourses.push({ id: courseId, credits })
    }
  }

  if (pendingMajorCourses.length > 0) {
    for (const o of pendingMajorCourses) {
      majorRoots.push({
        id: `major-req-${++reqIdCounter}`,
        path: [],
        rowKind: 'requirement',
        label: o.id,
        category: currentCategory || 'Requirements',
        credits: o.credits,
        auditSection: 'major',
        children: [],
        options: [o],
        seq: ++buildSeq,
        sectionSeq: majorSectionSeq,
      })
    }
  }

  const requirements = majorRoots
    .map(buildNodeToParsed)
    .map((r) => pruneEmpty(r))
    .filter((r): r is ParsedRequirement => r !== null)

  return { major, totalCredits, hoursSummary, requirements, completedCourses: [...completedCourses] }
}

export async function parseDegreeAudit(file: File): Promise<ParsedDegreeAudit> {
  const rawLines = await extractPdfTextLines(file)
  return parseDegreeAuditFromLines(rawLines)
}

/** Dev helper: paste lines from devtools after extracting PDF text; should yield POLI options under nested Option/Requirement rows. */
export const SAMPLE_MAP_NESTED_GE_LINES = [
  'Individual and Society - American Heritage Requirements — In Progress',
  '6.0 Hrs Option 1.1 — Complete 2',
  '2/2',
  'POLI 210',
  '3.0 Hrs Requirement 1.1.1 — Complete 1 Course',
  '3cr',
  '3.0 Hrs Requirement 1.1.2 — Complete 1 of 4 Courses',
  '3/3cr',
  'satisfied ▾',
  'POLI 250',
  '6.0 Hrs Option 1.2 — Complete 2',
  '1/2',
  'POLI 250',
]
