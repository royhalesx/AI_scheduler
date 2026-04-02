import fs from 'fs'
global.DOMMatrix = class DOMMatrix {
  constructor() {}
  multiply() { return this; }
  translate() { return this; }
  scale() { return this; }
} as any;
import { parseDegreeAudit } from './src/lib/parseDegreeAudit.ts'

async function run() {
  const buffer = fs.readFileSync('../mymap.pdf')
  // Polyfill File for Node
  const file = new File([buffer], 'mymap.pdf', { type: 'application/pdf' })
  
  const result = await parseDegreeAudit(file)
  
  const relReqs = result.requirements.filter((r: any) => r.category.includes('Religion'))
  console.log(JSON.stringify(relReqs, null, 2))
}

run().catch(console.error)
