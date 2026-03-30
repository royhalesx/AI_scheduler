import { SendHorizonal } from 'lucide-react'
import { useState } from 'react'
import { useChat } from '@/hooks/useChat'

export function AIChatPanel({ schedule, constraints, onScheduleUpdate }) {
  const [message, setMessage] = useState('')
  const { messages, sendMessage, isSending, error } = useChat(onScheduleUpdate)

  const handleSubmit = async (event) => {
    event.preventDefault()

    const trimmed = message.trim()
    if (!trimmed) {
      return
    }

    setMessage('')
    await sendMessage(trimmed, schedule, constraints)
  }

  return (
    <section className="flex h-full min-h-[26rem] min-w-[20rem] flex-col rounded-2xl border border-border bg-card/80 p-4 backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">AI Co-Pilot</p>
          <h3 className="font-mono text-lg font-semibold text-foreground">Schedule Assistant</h3>
        </div>
         {/* This can be changed later but I'm intending the user to list their major and 
            whether they're looking for easy classes or good professors etc... */}
            <button
              type="button"
              className="h-11 pl-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200 transition-colors duration-200 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 cursor-pointer"
            
            >
              Personal Info
            </button>
      </div>

      <div className="scrollbar-thin flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.map((chatMessage, index) => (
          <div
            key={`${chatMessage.role}-${index}`}
            className={chatMessage.role === 'assistant' ? 'mr-6' : 'ml-6'}
          >
            <div
              className={`rounded-xl p-3 text-sm leading-relaxed ${
                chatMessage.role === 'assistant'
                  ? 'border border-border bg-background/60 text-muted-foreground'
                  : 'bg-emerald-500 text-emerald-950'
              }`}
            >
              {chatMessage.content}
            </div>
          </div>
        ))}
      </div>

      {error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}

      <form onSubmit={handleSubmit} className="mt-3 flex items-end gap-2">
        <label htmlFor="ai-message" className="sr-only">
          Ask the schedule assistant
        </label>
        <textarea
          id="ai-message"
          rows={2}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Ask for lower workload, fewer gaps, or no classes before 10:00..."
          className="min-h-11 w-full resize-none rounded-xl border border-border bg-background/70 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
        />
        <button
          type="submit"
          disabled={isSending}
          className="inline-flex h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl bg-emerald-500 px-4 text-emerald-950 transition-colors duration-200 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          aria-label="Send message"
        >
          <SendHorizonal className={`size-4 ${isSending ? 'animate-pulse' : ''}`} />
        </button>
      </form>
    </section>
  )
}
