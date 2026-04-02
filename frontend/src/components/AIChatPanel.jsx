import { SendHorizonal, Trash2, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useChat } from '@/hooks/useChat'

export function AIChatPanel({ term, schedule, constraints, onScheduleUpdate, onRevertSchedule, major = '', completedCourses = [], remainingRequirements = [] }) {
  const [message, setMessage] = useState('')
  const { messages, sendMessage, isSending, error, clearMessages } = useChat(onScheduleUpdate)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSubmit = async (event) => {
    event.preventDefault()
    const trimmed = message.trim()
    if (!trimmed) return
    setMessage('')
    await sendMessage(trimmed, term, schedule, constraints, major, completedCourses, remainingRequirements)
  }

  const lastAssistantIndex = messages.map((m) => m.role).lastIndexOf('assistant')

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={clearMessages}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground/50 transition-colors hover:bg-secondary hover:text-rose-400"
          aria-label="Clear chat"
          title="Clear chat"
        >
          <Trash2 className="size-3" />
          Clear
        </button>
      </div>
      <div ref={scrollRef} className="scrollbar-thin flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.map((chatMessage, index) => (
          <div
            key={`${chatMessage.role}-${index}`}
            className={chatMessage.role === 'assistant' ? 'mr-4' : 'ml-4'}
          >
            <div
              className={`rounded-xl p-3 text-sm leading-relaxed ${chatMessage.role === 'assistant'
                  ? 'border border-border bg-background/60 text-muted-foreground'
                  : 'bg-byu-royal text-white'
                }`}
            >
              {chatMessage.role === 'assistant' ? (
                chatMessage.content
                  ? (
                    // While tokens stream in, avoid ReactMarkdown — partial `|` text is parsed as GFM tables and looks like garbage.
                    isSending && index === lastAssistantIndex
                      ? <div className="whitespace-pre-wrap">{chatMessage.content}</div>
                      : <ReactMarkdown
                          components={{
                            p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                            ul: ({ children }) => <ul className="my-1 ml-4 list-disc space-y-0.5">{children}</ul>,
                            ol: ({ children }) => <ol className="my-1 ml-4 list-decimal space-y-0.5">{children}</ol>,
                            li: ({ children }) => <li className="leading-snug">{children}</li>,
                            strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                            code: ({ children }) => <code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs">{children}</code>,
                          }}
                        >{chatMessage.content}</ReactMarkdown>
                    )
                  : <span className="animate-pulse text-muted-foreground/60">▍</span>
              ) : (
                chatMessage.content
              )}
            </div>
            {chatMessage.role === 'assistant' && index === lastAssistantIndex && onRevertSchedule && (
              <button
                type="button"
                onClick={onRevertSchedule}
                className="mt-1 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Undo2 className="size-3" />
                Revert change
              </button>
            )}
          </div>
        ))}
      </div>

      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}

      <form onSubmit={handleSubmit} className="mt-3 flex items-end gap-2">
        <label htmlFor="ai-message" className="sr-only">Ask the schedule assistant</label>
        <textarea
          id="ai-message"
          rows={2}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e) } }}
          placeholder="Ask a question"
          className="min-h-11 w-full resize-none rounded-xl border border-border bg-background/70 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-byu-blue focus:outline-none focus:ring-2 focus:ring-byu-blue/50"
        />
        <button
          type="submit"
          disabled={isSending}
          className="inline-flex h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl bg-byu-royal px-4 text-white transition-colors duration-200 hover:bg-byu-blue disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-byu-blue"
          aria-label="Send message"
        >
          <SendHorizonal className={`size-4 ${isSending ? 'animate-pulse' : ''}`} />
        </button>
      </form>
    </div>
  )
}
