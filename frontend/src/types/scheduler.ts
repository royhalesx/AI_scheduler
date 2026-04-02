export type Weekday = 'M' | 'T' | 'W' | 'Th' | 'F' | 'Sa'

export interface RMPData {
  rmpId?: string
  rating: number
  difficulty: number
  wouldTakeAgainPercent: number
  numRatings: number
  summary?: string
}

export interface SeatInfo {
  capacity: number
  enrolled: number
  available: number
}

export interface Meeting {
  days: Weekday[]
  startTime: string | null
  endTime: string | null
  location: string
}

export interface Section {
  id: string
  crn: string
  instructor: string
  meetings: Meeting[]
  seats: SeatInfo
  rmp?: RMPData
}

export interface Course {
  id: string
  title: string
  credits: number
  prerequisites: string[]
  sections: Section[]
}

export interface CoursesPayload {
  term: string
  updatedAt: string
  courses: Record<string, Course>
}

export interface ScheduledCourse {
  courseId: string
  title: string
  credits: number
  section: Section
  color: string
}

export interface ConstraintBlock {
  day: Weekday
  startTime: string
  endTime: string
}

export interface ChatRequest {
  message: string
  schedule: ScheduledCourse[]
  constraints: ConstraintBlock[]
}

export interface ChatResponse {
  response: string
}

export interface ScheduleUpdatePayload {
  addSections?: Array<{
    courseId: string
    sectionId?: string
  }>
  removeCourseIds?: string[]
}

export interface RequirementGroup {
  id: string        // stable key, e.g. "ge-arts", "major-CS-235"
  label: string     // display name, e.g. "Arts", "Data Structures"
  category: string  // section header for accordion grouping
  credits: number
  creditPerOption?: number  // default credits per option when stored as plain strings
  options: string[] // course IDs that satisfy this slot (single-element for major reqs)
  source: 'ge' | 'major'
}
