import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { AboutPage } from '@/pages/AboutPage'
import { SchedulerHome } from '@/pages/SchedulerHome'

function App() {
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
            <button
              type="button"
              className="h-11 cursor-pointer rounded-xl bg-byu-royal px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-byu-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-byu-blue"
            >
              Personal Info
            </button>
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
