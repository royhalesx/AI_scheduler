import * as pdfjsLib from 'pdfjs-dist'

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
}

export interface ParsedDegreeAudit {
  major: string
  totalCredits: number
  requirements: ParsedRequirement[]
  completedCourses: string[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Final grades that confirm a course is done.
// Excludes W (withdrawal), I (incomplete), NP, IP which mean NOT done.
const COMPLETED_GRADE_RE = /\b(A[+-]?|B[+-]?|C[+-]?|D[+-]?|P|CR|WVR)\b/

// BYU 3-digit course ID pattern.
// Handles: "CS 235", "EC EN 224", "REL A 275", "MATH 112", "IT&C 567", "PHSCS 121"
// Also handles PDF quirk where "CS" is written "C S" (space between single letters).
const COURSE_ID_RE = /\b([A-Z][A-Z&]{0,5}(?:\s[A-Z]{1,2})?)\s{1,3}(\d{3}[A-Z]?)\b/g

// ─── Section boundary patterns (work for any BYU major) ──────────────────────

// Main section header: "Computer Engineering (BS) Requirements — Not Completed"
//                      "Computer Science MINOR Requirements — Complete"
//                      "General Education Requirements — In Progress"
//                      "Religion Requirements — Planned"
const SECTION_HEADER_RE = /^(?!.*(?:Hrs?\s*Requirement|Requirement\s*\d+))(.+?)\s+(?:MINOR\s+)?Requirements?\s*[—–]/i

// Sub-requirement headers — never contain extractable course data
// "72.5 Hrs Requirement 1 — Complete 23 Courses — ..."
// "Requirement 2.1 — Complete 1 of 2 Courses — Complete"
const SUB_REQ_RE = /^(?:\d+\.?\d*\s+Hrs?\s*)?(?:Requirement|Option)\s+[\d.]+(?:\s*[—–]\s*(.*))?/i

// Lines that are instructions / footnotes — may contain course IDs incidentally
// "Note: WRTG 312 recommended."
// "You may take up to 3.0 credit hours"
// "Complete at least 12 credit hours of TECHNICAL ELECTIVES..."
// "Courses used to fulfill Requirement 3 cannot be used..."
// "This course is no longer available for registration..."
const NOTE_LINE_RE = /^(Note:|You may take|Complete at least|Complete a total|Courses used|Technical Electives?:|no longer available|possible substitutions|Obtain confirmation|Earn at least|This course is)/i

// The "Classes" section (semester-by-semester history) starts with one of these.
// Once seen, we stop — everything after is already-taken class history, not requirements.
const CLASSES_STOP_RE = /^Classes\s*$|^(Spring|Winter|Fall|Summer)\s+(Term|Semester)\s+\d{4}\s+---/i

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * BYU's PDF writes "C S" (with space) for the CS dept and "G E" for GE.
 * When the whole dept code is exactly one letter + space + one letter, merge them.
 *   "C S" → "CS"   "G E" → "GE"   "EC EN" stays   "REL A" stays
 */
function normalizeCourseId(dept: string, num: string): string {
  const d = /^[A-Z] [A-Z]$/.test(dept.trim()) ? dept.replace(/\s/, '') : dept.trim()
  return `${d} ${num}`
}

function extractFirstCourse(line: string): { courseId: string; index: number; fullMatch: string } | null {
  COURSE_ID_RE.lastIndex = 0
  const m = COURSE_ID_RE.exec(line)
  if (!m) return null
  return { courseId: normalizeCourseId(m[1], m[2]), index: m.index!, fullMatch: m[0] }
}

function guessMajor(lines: string[]): string {
  for (const line of lines.slice(0, 60)) {
    // "Program: PRIMARY Computer Engineering (BS)"
    // "Program: Computer Science (BS)"
    const m = line.match(/Program:\s*(?:PRIMARY\s+)?(.+?)(?:\s*---|$)/i)
    if (m) return m[1].replace(/^PRIMARY\s+/i, '').trim()
  }
  return ''
}

function guessTotalCredits(lines: string[]): number {
  for (const line of lines) {
    // Hours Analysis table: "Total Hours 190.0 112.5 59.2% 21.0 52.5 4.0"
    const m = line.match(/Total Hours\s+([\d.]+)/)
    if (m) {
      const n = parseFloat(m[1])
      if (n >= 60 && n <= 300) return Math.round(n)
    }
  }
  return 120 // BYU default
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function parseDegreeAudit(file: File): Promise<ParsedDegreeAudit> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  // Extract all text lines, preserving left-to-right reading order within each row
  const allLines: string[] = []

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()

    const byY = new Map<number, Array<{ x: number; str: string }>>()
    for (const item of content.items) {
      if (!('str' in item)) continue
      const it = item as { str: string; transform: number[] }
      const y = Math.round(it.transform[5] / 2) * 2 // round to 2px grid
      const row = byY.get(y) ?? []
      row.push({ x: it.transform[4], str: it.str })
      byY.set(y, row)
    }

    // Top of page first (PDF Y-axis is inverted), items within a row left→right
    const sortedYs = [...byY.keys()].sort((a, b) => b - a)
    for (const y of sortedYs) {
      const row = byY.get(y)!.sort((a, b) => a.x - b.x)
      const line = row.map((i) => i.str).join(' ').trim()
      if (line) allLines.push(line)
    }
  }

  const major = guessMajor(allLines)
  const totalCredits = guessTotalCredits(allLines)

  // ── Format validation ──────────────────────────────────────────────────
  // Require at least two of these BYU-specific fingerprints to be present
  // in the extracted text before attempting any parsing.
  const fullText = allLines.join('\n')
  const FINGERPRINTS = [
    /Requirements?\s*[—–]/i,          // "Requirements —" section headers
    /\bDegree\s+(?:Audit|Progress)\b/i, // "Degree Audit" or "Degree Progress"
    /\b(?:BYU|Brigham\s+Young\s+University)\b/i, // school name
    /\bGPA\b/i,                        // GPA line appears in every progress report
    /\bCredit\s+Hours?\b/i,            // credit hour totals
  ]
  const matched = FINGERPRINTS.filter(re => re.test(fullText)).length
  if (matched < 2) {
    throw new Error(
      'This PDF does not appear to be a BYU degree progress report. ' +
      'Please follow the instructions in the help panel to download your progress report from mymap.byu.edu.'
    )
  }

  // ── Section-by-section parsing ──────────────────────────────────────────

  const requirements: ParsedRequirement[] = []
  const completedCourses = new Set<string>()
  const seen = new Set<string>()

  // Track state as we walk through lines
  let currentCategory = ''        // current requirements section name
  let inRequirementsSection = false
  let currentGroup: ParsedRequirement | null = null
  let reqIdCounter = 0

  for (const line of allLines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // ── Hard stop: class history begins ────────────────────────────────
    if (CLASSES_STOP_RE.test(trimmed)) break

    // ── Section header → update category ───────────────────────────────
    const sectionMatch = trimmed.match(SECTION_HEADER_RE)
    if (sectionMatch) {
      let cat = sectionMatch[1]
        .replace(/^PRIMARY\s+/i, '')    // strip BYU's "PRIMARY" prefix
        .trim()
      if (/MINOR/i.test(trimmed)) cat += ' (Minor)'
      currentCategory = cat
      // Skip GE and Religion sections — already covered by geRequirements.ts
      inRequirementsSection = !/General Education|^Religion$/i.test(cat)
      currentGroup = null
      continue
    }

    // In skipped sections (GE, Religion) we still want to capture completed
    // courses so they get properly marked in the tracker.
    if (!inRequirementsSection) {
      // Look for "Completed COURSE_ID" pattern or a course with a grade
      const geMatch = extractFirstCourse(line)
      if (geMatch) {
        const afterId = line.slice(geMatch.index + geMatch.fullMatch.length)
        // Mark as completed if: preceded by "Completed", has a grade, or "In Progress"
        const beforeId = line.slice(0, geMatch.index)
        if (/Completed/i.test(beforeId) || COMPLETED_GRADE_RE.test(afterId) || /In Progress/i.test(afterId)) {
          completedCourses.add(geMatch.courseId)
        }
      }
      continue
    }

    // ── Sub-Requirement Header ─────────────────────────────────────────
    const subReqMatch = trimmed.match(SUB_REQ_RE)
    if (subReqMatch) {
      let reqCredits = 3
      const hrsMatch = trimmed.match(/^(\d+\.?\d*)\s+Hrs/i)
      if (hrsMatch) {
        reqCredits = parseFloat(hrsMatch[1])
      }
      
      const labelText = trimmed.replace(/\s+—\s+\(Completed.*$/, '').replace(/\s+—\s+Complete\s*$/, '').trim()
      
      currentGroup = {
        id: `major-req-${++reqIdCounter}`,
        label: labelText,
        category: currentCategory || 'Requirements',
        credits: reqCredits,
        options: []
      }
      requirements.push(currentGroup)
      continue
    }

    // ── Skip structural / annotation lines ─────────────────────────────
    // Notes, instructions, footnotes
    if (NOTE_LINE_RE.test(trimmed)) continue
    // Lines that are pure status words (column values with no other info)
    if (/^(Complete|Not Completed|In Progress|Planned|Deficient|Completed)\s*$/.test(trimmed)) continue
    // Page headers / student name lines
    if (/^Ben |^Page \d+$|^Brigham Young University|^Progress to Degree/.test(trimmed)) continue

    // ── Try to extract a course from this line ──────────────────────────
    const match = extractFirstCourse(line)
    if (!match) continue

    const { courseId, index, fullMatch } = match

    // ── Credits: first decimal number after the course ID ──────────────
    // Using a decimal (e.g. "3.0") avoids false hits on title words like
    // "Capstone Design 1" before the real credits "3.0".
    const afterId = line.slice(index + fullMatch.length)
    const creditsMatch = afterId.match(/\b(\d+\.\d+)\b/)
    const credits = creditsMatch ? parseFloat(creditsMatch[1]) : 3

    // ── Completion: line has a final grade letter or 'In Progress' ──────────────
    if (COMPLETED_GRADE_RE.test(afterId) || /In Progress/i.test(afterId)) {
      completedCourses.add(courseId)
    }

    // Skip if already captured (same course can appear in multiple sections)
    if (seen.has(courseId)) continue
    seen.add(courseId)

    // ── Title: text between course ID and first decimal / grade / semester
    let title = afterId
      .replace(/^[-–]\s*/, '')                                // leading dash
      .replace(/\b\d+\.\d+\b.*$/, '')                         // credits onward
      .replace(/\s+(Winter|Spring|Fall|Summer)\s+.*$/i, '')    // semester info
      .replace(/\s+(Planned|In Progress|Completed)\b.*$/i, '') // status words
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 80)

    if (!title) title = courseId

    if (currentGroup) {
      currentGroup.options.push({ id: courseId, credits })
    } else {
      requirements.push({
        id: `major-req-${++reqIdCounter}`,
        label: title || courseId,
        category: currentCategory || 'Requirements',
        credits,
        options: [{ id: courseId, credits }]
      })
    }
  }

  // Filter out any groups that ended up with 0 options
  const validRequirements = requirements.filter(r => r.options.length > 0)

  // Deduplicate requirement groups that share the same label+category.
  // BYU progress reports can emit the same section (e.g. "Religion Requirements") multiple
  // times (once for completed, once for planned/not-completed), which produces
  // duplicate sub-requirement entries. Merge them by combining options lists.
  const mergedMap = new Map<string, ParsedRequirement>()
  for (const req of validRequirements) {
    const key = `${req.category}|||${req.label}`
    const existing = mergedMap.get(key)
    if (existing) {
      // Merge options, avoiding duplicate course IDs
      const existingIds = new Set(existing.options.map(o => o.id))
      for (const opt of req.options) {
        if (!existingIds.has(opt.id)) {
          existing.options.push(opt)
          existingIds.add(opt.id)
        }
      }
    } else {
      mergedMap.set(key, { ...req, options: [...req.options] })
    }
  }
  const deduplicatedRequirements = [...mergedMap.values()]

  return { major, totalCredits, requirements: deduplicatedRequirements, completedCourses: [...completedCourses] }
}
