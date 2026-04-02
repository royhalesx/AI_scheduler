import { Github, Linkedin } from 'lucide-react'

const CREATORS = [
  {
    name: 'Ben Jensen',
    github: 'jenbensen17',
    linkedin: 'https://www.linkedin.com/in/benjamin-m-jensen/',
  },
  {
    name: 'Roy Hales',
    github: 'royhalesx',
    linkedin: 'https://www.linkedin.com/in/roy-hales-240776271/',
  },
]

export function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8 space-y-6">
      <section className="rounded-3xl border border-border bg-card/70 p-6 md:p-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-byu-light">About this project</p>
        <h1 className="mt-3 font-mono text-3xl font-semibold text-foreground">BYU Scheduler</h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          AI-powered course scheduling for BYU students. Build conflict-free schedules, compare professors,
          balance your workload, and get personalized suggestions — all in one place.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <article className="rounded-2xl border border-border bg-background/50 p-4">
            <h2 className="font-mono text-base font-semibold text-foreground">How it works</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Search courses, pick sections, review schedule conflicts and workload — then ask the AI assistant to refine your plan based on your constraints.
            </p>
          </article>
          <article className="rounded-2xl border border-border bg-background/50 p-4">
            <h2 className="font-mono text-base font-semibold text-foreground">AI Assistance</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Powered by Groq + LLaMA 3.3. The assistant knows your schedule, blocked times, and professor ratings so it can give actually useful advice.
            </p>
          </article>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card/70 p-6 md:p-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-byu-light">Built by</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {CREATORS.map((person) => (
            <div key={person.name} className="flex items-center gap-4 rounded-2xl border border-border bg-background/50 p-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-byu-royal/10 text-byu-royal font-mono font-bold text-lg">
                {person.name[0]}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground">{person.name}</p>
                <div className="mt-1.5 flex items-center gap-3">
                  <a
                    href={`https://github.com/${person.github}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Github className="size-3.5" />
                    {person.github}
                  </a>
                  <a
                    href={person.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-byu-royal transition-colors"
                  >
                    <Linkedin className="size-3.5" />
                    LinkedIn
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
