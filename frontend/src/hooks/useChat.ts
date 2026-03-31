import { useEffect, useRef, useState } from 'react'
import { API_BASE_URL, ApiError } from '@/lib/api'
import type {
  ConstraintBlock,
  ScheduledCourse,
  ScheduleUpdatePayload,
} from '@/types/scheduler'

const CHAT_STORAGE_KEY = 'byu_chat'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface UseChatResult {
  messages: ChatMessage[]
  isSending: boolean
  error: string | null
  sendMessage: (message: string, term: string, schedule: ScheduledCourse[], constraints: ConstraintBlock[]) => Promise<void>
  clearMessages: () => void
}

type AiActionPayload = {
  action?: string
  courses?: Array<{ courseId: string; sectionId?: string }>
  addSections?: Array<{ courseId: string; sectionId?: string }>
  removeCourseIds?: string[]
}

function parseScheduleUpdateFromResponse(content: string): ScheduleUpdatePayload | null {
  const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/i)
  if (!jsonMatch) return null

  try {
    const parsed = JSON.parse(jsonMatch[1]) as AiActionPayload

    // Handle {action, courses} format from the AI prompt
    if (parsed.action && parsed.courses) {
      if (parsed.action === 'add' || parsed.action === 'swap' || parsed.action === 'suggest_schedule') {
        return {
          addSections: parsed.courses.map((c) => ({ courseId: c.courseId, sectionId: c.sectionId })),
        }
      }
      if (parsed.action === 'remove') {
        return {
          removeCourseIds: parsed.courses.map((c) => c.courseId),
        }
      }
    }

    // Handle legacy {addSections, removeCourseIds} format
    if (parsed.addSections?.length || parsed.removeCourseIds?.length) {
      return { addSections: parsed.addSections, removeCourseIds: parsed.removeCourseIds }
    }

    return null
  } catch {
    return null
  }
}

function stripJsonBlock(content: string): string {
  return content.replace(/\n?```json[\s\S]*?```/gi, '').trim()
}

const DEFAULT_MESSAGE: ChatMessage = {
  role: 'assistant',
  content:
    'Hi! I can optimize your BYU schedule for balance, fewer conflicts, and professor quality. Ask for alternatives, workload balancing, or no-class-time constraints.',
}

function loadMessages(): ChatMessage[] {
  try {
    const stored = localStorage.getItem(CHAT_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as ChatMessage[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {
    // ignore
  }
  return [DEFAULT_MESSAGE]
}

export function useChat(onScheduleUpdate?: (payload: ScheduleUpdatePayload) => void): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const currentTermRef = useRef<string | null>(null)

  // Persist messages to localStorage on every change
  useEffect(() => {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages))
  }, [messages])

  const sendMessage = async (
    message: string,
    term: string,
    schedule: ScheduledCourse[],
    constraints: ConstraintBlock[],
  ): Promise<void> => {
    if (!message.trim() || isSending) {
      return
    }

    // Clear chat when the term changes
    if (currentTermRef.current !== null && currentTermRef.current !== term) {
      setMessages([DEFAULT_MESSAGE])
      localStorage.removeItem(CHAT_STORAGE_KEY)
    }
    currentTermRef.current = term

    setError(null)
    setIsSending(true)

    setMessages((prev) => [...prev, { role: 'user', content: message }])
    // Add empty assistant message that we'll stream into
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    try {
      const currentSchedule = schedule.map((item) => ({
        courseId: item.courseId,
        sectionId: item.section.id,
      }))

      const constraintsPayload = {
        blockedTimes: constraints.map((c) => ({
          days: c.day ? [c.day] : [],
          startTime: c.startTime,
          endTime: c.endTime,
        })),
        maxCredits: null,
        preferredDaysOff: [],
      }

      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, term, currentSchedule, constraints: constraintsPayload }),
      })

      if (!response.ok) {
        throw new ApiError(`Chat request failed: ${response.status}`, response.status)
      }

      if (!response.body) {
        throw new Error('No response body')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6).trim()
          if (!jsonStr) continue

          try {
            const event = JSON.parse(jsonStr) as { type: string; content?: string }

            if (event.type === 'text' && event.content) {
              fullContent += event.content
              setMessages((prev) => {
                const next = [...prev]
                next[next.length - 1] = { role: 'assistant', content: stripJsonBlock(fullContent) }
                return next
              })
            } else if (event.type === 'done') {
              const scheduleUpdate = parseScheduleUpdateFromResponse(fullContent)
              if (scheduleUpdate && onScheduleUpdate) {
                onScheduleUpdate(scheduleUpdate)
              }
            } else if (event.type === 'error' && event.content) {
              setMessages((prev) => {
                const next = [...prev]
                next[next.length - 1] = { role: 'assistant', content: event.content! }
                return next
              })
            }
          } catch {
            // ignore malformed SSE lines
          }
        }
      }
    } catch {
      const fallbackMessage =
        'I am temporarily unable to reach the AI endpoint. You can still build your schedule manually while I reconnect.'

      setMessages((prev) => {
        const next = [...prev]
        next[next.length - 1] = { role: 'assistant', content: fallbackMessage }
        return next
      })
      setError('AI chat is currently unavailable.')
    } finally {
      setIsSending(false)
    }
  }

  const clearMessages = () => {
    setMessages([DEFAULT_MESSAGE])
    localStorage.removeItem(CHAT_STORAGE_KEY)
  }

  return {
    messages,
    isSending,
    error,
    sendMessage,
    clearMessages,
  }
}
