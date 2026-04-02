import fs from 'fs'
import { parseDegreeAudit } from './src/lib/parseDegreeAudit.ts'

async function run() {
  const buffer = fs.readFileSync('../mymap.pdf')
  // Polyfill File for Node
  const file = new File([buffer], 'mymap.pdf', { type: 'application/pdf' })
  
  const result = await parseDegreeAudit(file)
  console.log(JSON.stringify(result.requirements, null, 2))
}

run().catch(console.error)
