import type {
  Course,
  RMPData,
} from '@/types/scheduler'

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`

    try {
      const payload = (await response.json()) as { detail?: string; message?: string }
      errorMessage = payload.detail || payload.message || errorMessage
    } catch {
      // no-op: keep fallback message
    }

    throw new ApiError(errorMessage, response.status)
  }

  return (await response.json()) as T
}

export interface TermMeta {
  yearterm: string
  term: string
  updatedAt: string
}

// /api/terms returns an object keyed by yearterm: {"20263": {term, yearterm, updatedAt}}
export async function fetchTerms(): Promise<TermMeta[]> {
  const raw = await apiFetch<Record<string, TermMeta>>('/api/terms')
  return Object.values(raw)
}

type RawCourseSection = Omit<Course['sections'][number], 'id'>

type RawCoursesPayload = {
  term: string
  courses: Record<
    string,
    {
      title: string
      credits: number
      prerequisites?: string[]
      sections: Record<string, RawCourseSection>
    }
  >
}

export async function fetchCourses(yearterm?: string): Promise<{ term: string; yearterm: string; updatedAt: string; courses: Course[] }> {
  const terms = await fetchTerms()

  // Sort by yearterm descending (highest = most recent)
  const sorted = [...terms].sort((a, b) => Number(b.yearterm) - Number(a.yearterm))

  const selected = yearterm ? sorted.find((t) => t.yearterm === yearterm) ?? sorted[0] : sorted[0]

  if (!selected) {
    throw new ApiError('No terms available', 404)
  }

  const latest = selected

  const payload = await apiFetch<RawCoursesPayload>(`/api/courses?term=${latest.yearterm}`)

  const courses: Course[] = Object.entries(payload.courses).map(([courseId, course]) => ({
    id: courseId,
    title: course.title,
    credits: course.credits,
    prerequisites: course.prerequisites || [],
    sections: Object.entries(course.sections).map(([sectionId, section]) => ({
      ...section,
      id: sectionId,
    })),
  }))

  return {
    term: payload.term,
    yearterm: latest.yearterm,
    updatedAt: latest.updatedAt,
    courses,
  }
}

export async function fetchCourseById(courseId: string, yearterm: string): Promise<Course> {
  const payload = await apiFetch<RawCoursesPayload['courses'][string]>(
    `/api/courses/${encodeURIComponent(courseId)}?term=${yearterm}`,
  )

  return {
    id: courseId,
    title: payload.title,
    credits: payload.credits,
    prerequisites: payload.prerequisites || [],
    sections: Object.entries(payload.sections).map(([sectionId, section]) => ({
      ...section,
      id: sectionId,
    })),
  }
}

export async function fetchProfessor(name: string): Promise<RMPData> {
  return apiFetch<RMPData>(`/api/professors/${encodeURIComponent(name)}`)
}

export async function fetchMockCourses(): Promise<{ term: string; yearterm: string; updatedAt: string; courses: Course[] }> {
  const response = await fetch('/mock-courses.json')

  if (!response.ok) {
    throw new ApiError('Unable to load mock course data', response.status)
  }

  const payload = (await response.json()) as RawCoursesPayload & { updatedAt?: string }

  return {
    term: payload.term,
    yearterm: '00000',
    updatedAt: payload.updatedAt ?? '',
    courses: Object.entries(payload.courses).map(([id, course]) => ({
      id,
      title: course.title,
      credits: course.credits,
      prerequisites: course.prerequisites || [],
      sections: Object.entries(course.sections).map(([sectionId, section]) => ({
        ...section,
        id: sectionId,
      })),
    })),
  }
}
