import { useEffect, useMemo, useState } from 'react'
import { ApiError, fetchCourses, fetchMockCourses, fetchTerms, type TermMeta } from '@/lib/api'
import type { Course } from '@/types/scheduler'

const YEARTERM_KEY = 'byu_yearterm'

interface UseCoursesResult {
  courses: Course[]
  filteredCourses: Course[]
  query: string
  setQuery: (value: string) => void
  loading: boolean
  error: string | null
  term: string
  yearterm: string
  updatedAt: string
  usingFallback: boolean
  availableTerms: TermMeta[]
  selectedYearterm: string
  setSelectedYearterm: (value: string) => void
}

export function useCourses(): UseCoursesResult {
  const [courses, setCourses] = useState<Course[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [term, setTerm] = useState('')
  const [yearterm, setYearterm] = useState('')
  const [updatedAt, setUpdatedAt] = useState('')
  const [usingFallback, setUsingFallback] = useState(false)
  const [availableTerms, setAvailableTerms] = useState<TermMeta[]>([])
  const [selectedYearterm, setSelectedYeartermState] = useState<string>(
    () => localStorage.getItem(YEARTERM_KEY) ?? '',
  )

  const setSelectedYearterm = (value: string) => {
    setSelectedYeartermState(value)
    localStorage.setItem(YEARTERM_KEY, value)
  }

  // On mount, fetch available terms
  useEffect(() => {
    fetchTerms()
      .then((terms) => {
        const sorted = [...terms].sort((a, b) => Number(b.yearterm) - Number(a.yearterm))
        setAvailableTerms(sorted)

        // If saved yearterm is no longer valid (or not set), fall back to latest
        const saved = localStorage.getItem(YEARTERM_KEY)
        const isValid = saved && sorted.some((t) => t.yearterm === saved)
        if (!isValid && sorted.length > 0) {
          setSelectedYearterm(sorted[0].yearterm)
        }
      })
      .catch(() => {
        // silently ignore — fetchCourses will handle the fallback
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let isMounted = true

    const loadCourses = async () => {
      setLoading(true)
      setError(null)

      try {
        const payload = await fetchCourses(selectedYearterm || undefined)

        if (!isMounted) {
          return
        }

        setCourses(payload.courses)
        setTerm(payload.term)
        setYearterm(payload.yearterm)
        setUpdatedAt(payload.updatedAt)
        setUsingFallback(false)
      } catch (apiError) {
        try {
          const fallbackPayload = await fetchMockCourses()

          if (!isMounted) {
            return
          }

          setCourses(fallbackPayload.courses)
          setTerm(fallbackPayload.term)
          setYearterm(fallbackPayload.yearterm)
          setUpdatedAt(fallbackPayload.updatedAt)
          setUsingFallback(true)
          setError('Live course API unavailable. Showing local BYU snapshot data.')
        } catch {
          if (!isMounted) {
            return
          }

          if (apiError instanceof ApiError) {
            setError(apiError.message)
          } else {
            setError('Unable to load courses right now. Please try again shortly.')
          }
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    void loadCourses()

    return () => {
      isMounted = false
    }
  }, [selectedYearterm])

  const filteredCourses = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) {
      return []
    }

    type Scored = { course: Course; score: number }
    const scored: Scored[] = []

    for (const course of courses) {
      const id = course.id.toLowerCase()
      const title = course.title.toLowerCase()
      const instructorMatch = course.sections.some((section) =>
        section.instructor.toLowerCase().includes(normalizedQuery),
      )

      let score = 0
      if (id.startsWith(normalizedQuery)) score = 3        // "cs" → "CS 235" prefix
      else if (id.includes(normalizedQuery)) score = 2     // id contains query
      else if (title.includes(normalizedQuery)) score = 1  // title contains query
      else if (instructorMatch) score = 0                  // instructor only
      else continue                                        // no match

      scored.push({ course, score })
    }

    return scored
      .sort((a, b) => b.score - a.score || a.course.id.localeCompare(b.course.id))
      .slice(0, 15)
      .map((s) => s.course)
  }, [courses, query])

  return {
    courses,
    filteredCourses,
    query,
    setQuery,
    loading,
    error,
    term,
    yearterm,
    updatedAt,
    usingFallback,
    availableTerms,
    selectedYearterm,
    setSelectedYearterm,
  }
}
