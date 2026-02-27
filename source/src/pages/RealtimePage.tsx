import { useState, useEffect, useRef, useCallback } from 'react'

// Types
interface Message {
  id: string
  title: string
  content: string
  __createdAt__?: string
}

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

// Get the base URL for API calls
const BASE_URL = window.location.origin + '/demo-realtime'
const RECONNECT_DELAY = 5000

const getWebSocketUrl = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/demo-realtime/message/`
}

const getSSEUrl = () => `${BASE_URL}/message/`

// Sample text generators
const SAMPLE_TITLES = [
  'System Update Available', 'New Feature Released', 'Server Maintenance Scheduled',
  'Database Backup Complete', 'User Feedback Received', 'Performance Metrics Updated',
  'Security Patch Applied', 'API Rate Limit Increased', 'Cache Cleared Successfully',
  'Deployment Completed'
]

const SAMPLE_CONTENTS = [
  'All systems are operating normally', 'Please review the latest changes',
  'This will take approximately 30 minutes', 'No action required from your end',
  'Check the dashboard for more details', 'Everything is running smoothly',
  'Users have been notified automatically', 'Monitoring tools have been updated',
  'Log files are being processed', 'Configuration has been optimized'
]

const getRandomSample = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)]

// Status dot component
function StatusDot({ status }: { status: ConnectionStatus }) {
  return <span className={`status-dot ${status}`}></span>
}

// Message list panel body
interface MessagePanelProps {
  messages: Message[]
  newIds: Set<string>
}

function MessagePanelBody({ messages, newIds }: MessagePanelProps) {
  const formatMessageTime = (timestamp?: string) => {
    if (!timestamp) return ''
    return new Date(timestamp).toLocaleString()
  }

  const sortedMessages = [...messages].sort((a, b) => {
    const timeA = a.__createdAt__ ? new Date(a.__createdAt__).getTime() : 0
    const timeB = b.__createdAt__ ? new Date(b.__createdAt__).getTime() : 0
    return timeB - timeA
  })

  if (messages.length === 0) {
    return (
      <div className="panel-body empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <p>No messages yet</p>
      </div>
    )
  }

  return (
    <div className="panel-body">
      {sortedMessages.map(msg => (
        <div
          key={msg.id}
          className={`message-item ${newIds.has(msg.id) ? 'new' : ''}`}
        >
          <div className="message-title">{msg.title}</div>
          <div className="message-content">{msg.content}</div>
          <div className="message-meta">
            <span>{formatMessageTime(msg.__createdAt__)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

export function RealtimePage() {
  // WebSocket state
  const [wsMessages, setWsMessages] = useState<Message[]>([])
  const [wsStatus, setWsStatus] = useState<ConnectionStatus>('connecting')
  const [wsNewIds, setWsNewIds] = useState<Set<string>>(new Set())
  const wsRef = useRef<WebSocket | null>(null)
  const wsReconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // SSE state
  const [sseMessages, setSseMessages] = useState<Message[]>([])
  const [sseStatus, setSseStatus] = useState<ConnectionStatus>('connecting')
  const [sseNewIds, setSseNewIds] = useState<Set<string>>(new Set())
  const sseRef = useRef<EventSource | null>(null)
  const sseReconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // REST state
  const [restMessages, setRestMessages] = useState<Message[]>([])
  const [restStatus, setRestStatus] = useState<ConnectionStatus>('disconnected')
  const [restNewIds, setRestNewIds] = useState<Set<string>>(new Set())

  const [error, setError] = useState<string | null>(null)

  // Form state
  const [title, setTitle] = useState(getRandomSample(SAMPLE_TITLES))
  const [content, setContent] = useState(getRandomSample(SAMPLE_CONTENTS))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showValidation, setShowValidation] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  // Track initial load
  const wsInitialLoadRef = useRef(true)
  const sseInitialLoadRef = useRef(true)
  const restInitialLoadRef = useRef(true)

  const markAsNew = (setNewIds: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => {
    setNewIds(prev => new Set([...prev, id]))
    setTimeout(() => {
      setNewIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }, 2000)
  }

  const handleWebSocketMessage = useCallback((event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data)
      const msgType = msg.type
      const data = msg.data
      const id = msg.id || data?.id

      if (msgType === 'update' || msgType === 'put') {
        setWsMessages(prev => {
          const existing = prev.find(m => m.id === id)
          if (existing) {
            return prev.map(m => m.id === id ? data : m)
          } else {
            if (!wsInitialLoadRef.current) markAsNew(setWsNewIds, id)
            return [...prev, data]
          }
        })
      } else if (msgType === 'delete') {
        setWsMessages(prev => prev.filter(m => m.id !== id))
      }
    } catch (err) {
      console.error('Failed to parse WebSocket message:', err)
    }
  }, [])

  const fetchInitialMessages = useCallback(async (
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
    initialLoadRef: React.MutableRefObject<boolean>,
  ) => {
    try {
      const response = await fetch(`${BASE_URL}/message/?limit=50`)
      if (!response.ok) return
      const data = await response.json()
      if (Array.isArray(data)) {
        setMessages(data)
        initialLoadRef.current = false
      }
    } catch { /* ignore */ }
  }, [])

  const fetchInitialWsMessages = useCallback(async () => {
    await fetchInitialMessages(setWsMessages, wsInitialLoadRef)
  }, [fetchInitialMessages])

  const connectWebSocket = useCallback(() => {
    if (wsRef.current) wsRef.current.close()
    setWsStatus('connecting')
    try {
      const ws = new WebSocket(getWebSocketUrl())
      wsRef.current = ws
      ws.onopen = () => { setWsStatus('connected'); fetchInitialWsMessages() }
      ws.onmessage = handleWebSocketMessage
      ws.onerror = () => {}
      ws.onclose = (event) => {
        setWsStatus('disconnected')
        if (event.code !== 1000) {
          wsReconnectRef.current = setTimeout(connectWebSocket, RECONNECT_DELAY)
        }
      }
    } catch {
      setWsStatus('disconnected')
    }
  }, [handleWebSocketMessage, fetchInitialWsMessages])

  const fetchInitialSseMessages = useCallback(async () => {
    await fetchInitialMessages(setSseMessages, sseInitialLoadRef)
  }, [fetchInitialMessages])

  const connectSSE = useCallback(() => {
    if (sseRef.current) sseRef.current.close()
    setSseStatus('connecting')
    const eventSource = new EventSource(getSSEUrl())
    sseRef.current = eventSource

    eventSource.onopen = () => { setSseStatus('connected'); fetchInitialSseMessages() }

    eventSource.addEventListener('update', (event) => {
      try {
        const data = JSON.parse(event.data) as Message
        setSseMessages(prev => {
          const existing = prev.find(m => m.id === data.id)
          if (existing) return prev.map(m => m.id === data.id ? data : m)
          if (!sseInitialLoadRef.current) markAsNew(setSseNewIds, data.id)
          return [...prev, data]
        })
      } catch { /* ignore */ }
    })

    eventSource.addEventListener('delete', (event) => {
      try {
        const data = JSON.parse(event.data) as { id: string }
        setSseMessages(prev => prev.filter(m => m.id !== data.id))
      } catch { /* ignore */ }
    })

    eventSource.onerror = () => {
      setSseStatus('disconnected')
      eventSource.close()
      sseReconnectRef.current = setTimeout(connectSSE, RECONNECT_DELAY)
    }
  }, [fetchInitialSseMessages])

  const fetchRestMessages = useCallback(async (fetchRecords = false) => {
    setRestStatus('connecting')
    try {
      const url = fetchRecords ? `${BASE_URL}/message/?limit=50` : `${BASE_URL}/message`
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      const data = await response.json()
      if (data && typeof data === 'object' && 'attributes' in data) {
        setRestStatus('connected')
        return
      }
      const messages = data as Message[]
      setRestStatus('connected')
      setRestMessages(prevMessages => {
        const prevIds = new Set(prevMessages.map(m => m.id))
        if (!restInitialLoadRef.current) {
          messages.filter(msg => !prevIds.has(msg.id)).forEach(msg => markAsNew(setRestNewIds, msg.id))
        } else {
          restInitialLoadRef.current = false
        }
        return messages
      })
    } catch (err) {
      setRestStatus('disconnected')
      setError(err instanceof Error ? err.message : 'Failed to fetch messages')
    }
  }, [])

  useEffect(() => {
    connectWebSocket()
    connectSSE()
    fetchRestMessages(true)
    return () => {
      if (wsRef.current) wsRef.current.close(1000)
      if (sseRef.current) sseRef.current.close()
      if (wsReconnectRef.current) clearTimeout(wsReconnectRef.current)
      if (sseReconnectRef.current) clearTimeout(sseReconnectRef.current)
    }
  }, [connectWebSocket, connectSSE, fetchRestMessages])

  const handleDeleteAll = async () => {
    setShowDeleteModal(false)
    setIsSubmitting(true)
    setError(null)
    try {
      // Fetch only current visible messages and delete them
      const response = await fetch(`${BASE_URL}/message/?limit=200`)
      if (!response.ok) throw new Error('Failed to fetch messages')
      const messages = await response.json() as Message[]
      await Promise.all(
        messages.map(msg => fetch(`${BASE_URL}/message/${msg.id}`, { method: 'DELETE' }))
      )
      setWsMessages([])
      setSseMessages([])
      setRestMessages([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete messages')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setShowValidation(true)
    if (!title.trim() || !content.trim()) return
    setIsSubmitting(true)
    try {
      const message = {
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        title: title.trim(),
        content: content.trim(),
        __createdAt__: new Date().toISOString()
      }
      const response = await fetch(`${BASE_URL}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
      })
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || 'Failed to create message')
      }
      setTitle(getRandomSample(SAMPLE_TITLES))
      setContent(getRandomSample(SAMPLE_CONTENTS))
      setShowValidation(false)
      await fetchRestMessages(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      {/* Toolbar: form + actions */}
      <div className="toolbar">
        <form onSubmit={handleSubmit} className="toolbar-form">
          <input
            type="text"
            className={`toolbar-input ${showValidation && !title.trim() ? 'error' : ''}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title..."
          />
          <input
            type="text"
            className={`toolbar-input toolbar-input-wide ${showValidation && !content.trim() ? 'error' : ''}`}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Content..."
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={isSubmitting}>
            {isSubmitting ? 'Posting...' : 'POST'}
          </button>
        </form>
        <div className="toolbar-actions">
          {error && <span className="toolbar-error">{error}</span>}
          <button
            onClick={() => setShowDeleteModal(true)}
            className="btn btn-sm"
            disabled={isSubmitting}
          >
            Delete All
          </button>
        </div>
      </div>

      <main className="main-container">
        {/* WebSocket panel */}
        <div className="panel">
          <div className="panel-header">
            <div className="panel-header-left">
              <StatusDot status={wsStatus} />
              <span className="panel-title">WebSocket</span>
            </div>
            <span className="panel-badge">{wsMessages.length}</span>
          </div>
          <MessagePanelBody messages={wsMessages} newIds={wsNewIds} />
        </div>

        {/* SSE panel */}
        <div className="panel">
          <div className="panel-header">
            <div className="panel-header-left">
              <StatusDot status={sseStatus} />
              <span className="panel-title">SSE Stream</span>
            </div>
            <span className="panel-badge">{sseMessages.length}</span>
          </div>
          <MessagePanelBody messages={sseMessages} newIds={sseNewIds} />
        </div>

        {/* REST panel */}
        <div className="panel">
          <div className="panel-header">
            <div className="panel-header-left">
              <StatusDot status={restStatus} />
              <span className="panel-title">REST Poll</span>
            </div>
            <span className="panel-badge">{restMessages.length}</span>
          </div>
          <MessagePanelBody messages={restMessages} newIds={restNewIds} />
        </div>
      </main>

      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Delete All Messages?</h2>
            <p className="modal-message">
              This will permanently delete all messages. This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button onClick={() => setShowDeleteModal(false)} className="btn btn-cancel">Cancel</button>
              <button onClick={handleDeleteAll} className="btn btn-primary">Delete All</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
