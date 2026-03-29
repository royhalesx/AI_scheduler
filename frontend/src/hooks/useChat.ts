import { useState } from 'react'
import { sendChatMessage } from '@/lib/api'
import type {
  ConstraintBlock,
  ScheduledCourse,
  ScheduleUpdatePayload,
} from '@/types/scheduler'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface UseChatResult {
  messages: ChatMessage[]
  isSending: boolean
  error: string | null
  sendMessage: (message: string, schedule: ScheduledCourse[], constraints: ConstraintBlock[]) => Promise<void>
}

function parseScheduleUpdateFromResponse(content: string): ScheduleUpdatePayload | null {
  const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/i)
  const directContent = jsonMatch ? jsonMatch[1] : content

  try {
    const parsed = JSON.parse(directContent) as ScheduleUpdatePayload
    const hasAction = Boolean(parsed.addSections?.length || parsed.removeCourseIds?.length)
    return hasAction ? parsed : null
  } catch {
    return null
  }
}

export function useChat(onScheduleUpdate?: (payload: ScheduleUpdatePayload) => void): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        'Hi! I can optimize your BYU schedule for balance, fewer conflicts, and professor quality. Ask for alternatives, workload balancing, or no-class-time constraints.',
    },
  ])
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendMessage = async (
    message: string,
    schedule: ScheduledCourse[],
    constraints: ConstraintBlock[],
  ): Promise<void> => {
    if (!message.trim() || isSending) {
      return
    }

    setError(null)
    setIsSending(true)

    setMessages((prev) => [...prev, { role: 'user', content: message }])

    try {
      const response = await sendChatMessage({
        message,
        schedule,
        constraints,
      })

      const assistantMessage = response.response || 'I could not generate a recommendation yet.'
      setMessages((prev) => [...prev, { role: 'assistant', content: assistantMessage }])

      const scheduleUpdate = parseScheduleUpdateFromResponse(assistantMessage)
      if (scheduleUpdate && onScheduleUpdate) {
        onScheduleUpdate(scheduleUpdate)
      }
    } catch {
      const fallbackMessage =
        'I am temporarily unable to reach the AI endpoint. You can still build your schedule manually while I reconnect.'

      setMessages((prev) => [...prev, { role: 'assistant', content: fallbackMessage }])
      setError('AI chat is currently unavailable.')
    } finally {
      setIsSending(false)
    }
  }

  return {
    messages,
    isSending,
    error,
    sendMessage,
  }
}
