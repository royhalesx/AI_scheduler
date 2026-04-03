/**
 * CLI: node scripts/dumpPdfLines.mjs <path-to.pdf>
 * Mirrors parseDegreeAudit.ts row reconstruction (sort by Y, join x-ordered chunks).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function extractLinesFromPdfBytes(data) {
  const pdf = await getDocument({
    data,
    disableWorker: true,
    verbosity: 0,
  }).promise

  const allLines = []
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()

    const byY = new Map()
    for (const item of content.items) {
      if (!('str' in item)) continue
      const it = item
      const y = Math.round(it.transform[5] / 2) * 2
      const row = byY.get(y) ?? []
      row.push({ x: it.transform[4], str: it.str })
      byY.set(y, row)
    }

    const sortedYs = [...byY.keys()].sort((a, b) => b - a)
    for (const y of sortedYs) {
      const row = byY.get(y).sort((a, b) => a.x - b.x)
      const line = row.map((i) => i.str).join('').replace(/\s{2,}/g, ' ').trim()
      if (line) allLines.push({ page: pageNum, line })
    }
  }
  return allLines
}

const pdfPath = process.argv[2]
if (!pdfPath) {
  console.error('Usage: node scripts/dumpPdfLines.mjs <file.pdf>')
  process.exit(1)
}

const abs = path.isAbsolute(pdfPath) ? pdfPath : path.join(__dirname, '..', pdfPath)
const buf = new Uint8Array(fs.readFileSync(abs))
const rows = await extractLinesFromPdfBytes(buf)

for (const { page, line } of rows) {
  console.log(`[p${page}] ${line}`)
}
