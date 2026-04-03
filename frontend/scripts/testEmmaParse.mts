import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ParsedRequirement } from '../src/lib/parseDegreeAudit.ts'
import { parseDegreeAuditFromLines } from '../src/lib/parseDegreeAudit.ts'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixture = path.join(root, 'test-fixtures/emma_map.lines.txt')
const rawLines = readFileSync(fixture, 'utf8')
  .split('\n')
  .map((l) => l.replace(/^\[p\d+\]\s*/, ''))
  .filter((l) => l.trim() !== '')

function printTree(n: ParsedRequirement, indent = '') {
  const leaf = !n.children?.length
  const optPart = leaf ? ` [${n.options.map((o) => o.id).join(', ')}]` : ''
  console.log(`${indent}${n.aggregate ?? 'leaf'} ${n.label.slice(0, 72)}${optPart}`)
  for (const c of n.children ?? []) printTree(c, indent + '  ')
}

const r = parseDegreeAuditFromLines(rawLines)

console.log('major:', r.major)
console.log('hoursSummary:', r.hoursSummary)
console.log('totalCredits (required):', r.totalCredits)
console.log('top-level roots:', r.requirements.length)
const req1 = r.requirements.find((x) => /\bRequirement 1\b/.test(x.label) && !x.label.includes('1.1'))
if (req1) {
  console.log('\n--- Sample tree (Requirement 1) ---')
  printTree(req1)
}
