import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import { readFileSync } from 'fs'

const filePath = process.argv[2]
const data = readFileSync(filePath)
const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(data.buffer) }).promise

console.log('Total pages:', pdf.numPages)

for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p)
  const content = await page.getTextContent()
  
  // Group by Y coordinate, but keep x for ordering
  const byY = new Map()
  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue
    const y = Math.round(item.transform[5] / 2) * 2
    const row = byY.get(y) ?? []
    row.push({ x: item.transform[4], str: item.str })
    byY.set(y, row)
  }
  
  // Sort rows top-to-bottom, items left-to-right within each row
  const sortedRows = [...byY.entries()].sort((a, b) => b[0] - a[0])
  
  console.log(`\n=== PAGE ${p} ===`)
  for (const [y, items] of sortedRows) {
    const sorted = items.sort((a, b) => a.x - b.x)
    // Show each item with its x position to understand column layout
    const line = sorted.map(i => `[x=${Math.round(i.x)}]${i.str}`).join(' ')
    console.log(`y=${y}: ${line}`)
  }
}
