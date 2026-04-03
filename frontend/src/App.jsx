import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { AboutPage } from '@/pages/AboutPage'
import { SchedulerHome } from '@/pages/SchedulerHome'

function clearAllSiteStorageAndReload() {
  if (
    !window.confirm(
      'Clear all saved data for BYU Scheduler on this browser? This removes your schedule, term choice, degree progress, chat history, and preferences. You cannot undo this.',
    )
  ) {
    return
  }
  try {
    localStorage.clear()
    sessionStorage.clear()
  } catch {
    /* ignore quota / private mode */
  }
  window.location.reload()
}

function App() {
  const [personalOpen, setPersonalOpen] = useState(false)
  const personalRef = useRef(null)

  useEffect(() => {
    if (!personalOpen) return
    const onPointerDown = (e) => {
      if (personalRef.current && !personalRef.current.contains(e.target)) {
        setPersonalOpen(false)
      }
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setPersonalOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [personalOpen])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/90 bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2 cursor-pointer">
            <img src="/logo.png" alt="BYU Cougars" className="h-8 w-auto" />
            <span className="font-mono text-lg font-semibold text-foreground">BYU Scheduler</span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/"
              className="h-11 cursor-pointer pt-2.5 rounded-xl border text-center border-border px-4 text-sm font-medium text-foreground transition-colors duration-200 hover:border-byu-blue/70 hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-byu-blue"
            >
              Schedule
            </Link>
            <Link
              to="/about"
              className="h-11 cursor-pointer pt-2.5 rounded-xl border text-center border-border px-4 text-sm font-medium text-foreground transition-colors duration-200 hover:border-byu-blue/70 hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-byu-blue"
            >
              About
            </Link>
            <div className="relative" ref={personalRef}>
              <button
                type="button"
                aria-expanded={personalOpen}
                aria-haspopup="dialog"
                onClick={() => setPersonalOpen((o) => !o)}
                className="h-11 cursor-pointer rounded-xl bg-byu-royal px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-byu-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-byu-blue"
              >
                Personal Info
              </button>
              {personalOpen ? (
                <div
                  role="dialog"
                  aria-label="Personal info"
                  className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border bg-card p-4 shadow-lg"
                >
                  <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Personal info</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Schedules, degree audit data, chat, and settings are stored only in this browser.
                  </p>
                  <Button
                    type="button"
                    variant="destructive"
                    className="mt-4 w-full"
                    onClick={() => clearAllSiteStorageAndReload()}
                  >
                    Clear all saved data
                  </Button>
                </div>
              ) : null}
            </div>
          </nav>
        </div>
      </header>

      <Routes>
        <Route path="/" element={<SchedulerHome />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

export default App
