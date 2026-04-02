const text = "8.0 HrsRequirement 3 — Complete 8 hours — (Completed: 0 — Planned: 4 — Deficient: 4)";
const re = /^(?:\d+\.?\d*\s+Hrs?\s*)?(?:Requirement|Option)\s+[\d.]+\s*[—–]\s*(.*)/i;
console.log(text.match(re));
