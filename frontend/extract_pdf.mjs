import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

const filePath = process.argv[2]
const data = await (await import('fs')).promises.readFile(filePath)
const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(data.buffer) }).promise

for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p)
  const content = await page.getTextContent()
  const byY = new Map()
  for (const item of content.items) {
    if (!('str' in item)) continue
    const y = Math.round(item.transform[5] / 2) * 2
    const row = byY.get(y) ?? []
    row.push({ x: item.transform[4], str: item.str })
    byY.set(y, row)
  }
  const lines = [...byY.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, items]) => items.sort((a, b) => a.x - b.x).map(i => i.str).join(''))
  console.log(`=== PAGE ${p} ===`)
  lines.forEach(l => { if (l.trim()) console.log(l) })
}
