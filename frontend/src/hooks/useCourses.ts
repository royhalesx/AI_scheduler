import { useEffect, useMemo, useState } from 'react'
import { ApiError, fetchCourses, fetchMockCourses } from '@/lib/api'
import type { Course } from '@/types/scheduler'

interface UseCoursesResult {
  courses: Course[]
  filteredCourses: Course[]
  query: string
  setQuery: (value: string) => void
  loading: boolean
  error: string | null
  term: string
  updatedAt: string
  usingFallback: boolean
}

export function useCourses(): UseCoursesResult {
  const [courses, setCourses] = useState<Course[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [term, setTerm] = useState('')
  const [updatedAt, setUpdatedAt] = useState('')
  const [usingFallback, setUsingFallback] = useState(false)

  useEffect(() => {
    let isMounted = true

    const loadCourses = async () => {
      setLoading(true)
      setError(null)

      try {
        const payload = await fetchCourses()

        if (!isMounted) {
          return
        }

        setCourses(payload.courses)
        setTerm(payload.term)
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
  }, [])

  const filteredCourses = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) {
      return courses.slice(0, 10)
    }

    return courses
      .filter((course) => {
        const idMatch = course.id.toLowerCase().includes(normalizedQuery)
        const titleMatch = course.title.toLowerCase().includes(normalizedQuery)
        const instructorMatch = course.sections.some((section) =>
          section.instructor.toLowerCase().includes(normalizedQuery),
        )

        return idMatch || titleMatch || instructorMatch
      })
      .slice(0, 15)
  }, [courses, query])

  return {
    courses,
    filteredCourses,
    query,
    setQuery,
    loading,
    error,
    term,
    updatedAt,
    usingFallback,
  }
}
