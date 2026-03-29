import type {
  ChatRequest,
  ChatResponse,
  Course,
  CoursesPayload,
  RMPData,
} from '@/types/scheduler'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

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

function normalizeCourses(payload: CoursesPayload): Course[] {
  return Object.entries(payload.courses).map(([id, course]) => ({
    ...course,
    id,
    sections: course.sections.map((section) => ({
      ...section,
      id: section.id || section.crn,
    })),
  }))
}

type RawCoursesPayload = {
  term: string
  updatedAt: string
  courses: Record<
    string,
    {
      title: string
      credits: number
      prerequisites?: string[]
      sections: Record<string, Omit<Course['sections'][number], 'id'>>
    }
  >
}

export async function fetchCourses(): Promise<{ term: string; updatedAt: string; courses: Course[] }> {
  const payload = await apiFetch<RawCoursesPayload>('/api/courses')

  const normalizedPayload: CoursesPayload = {
    term: payload.term,
    updatedAt: payload.updatedAt,
    courses: Object.fromEntries(
      Object.entries(payload.courses).map(([courseId, course]) => [
        courseId,
        {
          id: courseId,
          title: course.title,
          credits: course.credits,
          prerequisites: course.prerequisites || [],
          sections: Object.entries(course.sections).map(([sectionId, section]) => ({
            ...section,
            id: sectionId,
          })),
        },
      ]),
    ),
  }

  return {
    term: normalizedPayload.term,
    updatedAt: normalizedPayload.updatedAt,
    courses: normalizeCourses(normalizedPayload),
  }
}

export async function fetchCourseById(courseId: string): Promise<Course> {
  const payload = await apiFetch<RawCoursesPayload['courses'][string]>(`/api/courses/${encodeURIComponent(courseId)}`)

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

export async function sendChatMessage(body: ChatRequest): Promise<ChatResponse> {
  return apiFetch<ChatResponse>('/api/chat', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function fetchMockCourses(): Promise<{ term: string; updatedAt: string; courses: Course[] }> {
  const response = await fetch('/mock-courses.json')

  if (!response.ok) {
    throw new ApiError('Unable to load mock course data', response.status)
  }

  const payload = (await response.json()) as RawCoursesPayload

  return {
    term: payload.term,
    updatedAt: payload.updatedAt,
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

export { API_BASE_URL }
