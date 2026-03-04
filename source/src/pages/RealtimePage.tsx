import { useState, useEffect, useRef, useCallback } from 'react'
import mqtt from 'mqtt'

interface Message {
  id: string
  title: string
  content: string
  __createdAt__?: string
}

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

const BASE_URL = window.location.origin + '/demo-realtime'
const RECONNECT_DELAY = 5000

const getWebSocketUrl = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/demo-realtime/message/`
}

const getSSEUrl = () => `${BASE_URL}/message/`

const getMqttWsUrl = () => `wss://${window.location.host}/mqtt`

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

function StatusDot({ status }: { status: ConnectionStatus }) {
  return <span className={`status-dot ${status}`}></span>
}

interface MessagePanelProps {
  messages: Message[]
  newIds: Set<string>
}

function MessagePanelBody({ messages, newIds }: MessagePanelProps) {
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
        <div key={msg.id} className={`message-item ${newIds.has(msg.id) ? 'new' : ''}`}>
          <div className="message-title">{msg.title}</div>
          <div className="message-content">{msg.content}</div>
          <div className="message-meta">
            {msg.__createdAt__ && new Date(msg.__createdAt__).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  )
}

export function RealtimePage() {
  const [wsMessages, setWsMessages] = useState<Message[]>([])
  const [wsStatus, setWsStatus] = useState<ConnectionStatus>('connecting')
  const [wsNewIds, setWsNewIds] = useState<Set<string>>(new Set())
  const wsRef = useRef<WebSocket | null>(null)
  const wsReconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [sseMessages, setSseMessages] = useState<Message[]>([])
  const [sseStatus, setSseStatus] = useState<ConnectionStatus>('connecting')
  const [sseNewIds, setSseNewIds] = useState<Set<string>>(new Set())
  const sseRef = useRef<EventSource | null>(null)
  const sseReconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [restMessages, setRestMessages] = useState<Message[]>([])
  const [restStatus, setRestStatus] = useState<ConnectionStatus>('disconnected')
  const [restNewIds, setRestNewIds] = useState<Set<string>>(new Set())

  const [mqttMessages, setMqttMessages] = useState<Message[]>([])
  const [mqttStatus, setMqttStatus] = useState<ConnectionStatus>('disconnected')
  const [mqttNewIds, setMqttNewIds] = useState<Set<string>>(new Set())
  const mqttRef = useRef<mqtt.MqttClient | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState(getRandomSample(SAMPLE_TITLES))
  const [content, setContent] = useState(getRandomSample(SAMPLE_CONTENTS))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showValidation, setShowValidation] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  const wsInitialLoadRef = useRef(true)
  const sseInitialLoadRef = useRef(true)
  const restInitialLoadRef = useRef(true)
  const mqttInitialLoadRef = useRef(true)

  const markAsNew = (setNewIds: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => {
    setNewIds(prev => new Set([...prev, id]))
    setTimeout(() => {
      setNewIds(prev => { const next = new Set(prev); next.delete(id); return next })
    }, 2000)
  }

  const fetchMessages = useCallback(async (
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

  // WebSocket
  const connectWebSocket = useCallback(() => {
    if (wsRef.current) wsRef.current.close()
    setWsStatus('connecting')
    try {
      const ws = new WebSocket(getWebSocketUrl())
      wsRef.current = ws
      ws.onopen = () => { setWsStatus('connected'); fetchMessages(setWsMessages, wsInitialLoadRef) }
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          const data = msg.data
          const id = msg.id || data?.id
          if (msg.type === 'update' || msg.type === 'put') {
            setWsMessages(prev => {
              const exists = prev.find(m => m.id === id)
              if (exists) return prev.map(m => m.id === id ? data : m)
              if (!wsInitialLoadRef.current) markAsNew(setWsNewIds, id)
              return [...prev, data]
            })
          } else if (msg.type === 'delete') {
            setWsMessages(prev => prev.filter(m => m.id !== id))
          }
        } catch {}
      }
      ws.onerror = () => {}
      ws.onclose = (e) => {
        setWsStatus('disconnected')
        if (e.code !== 1000) wsReconnectRef.current = setTimeout(connectWebSocket, RECONNECT_DELAY)
      }
    } catch { setWsStatus('disconnected') }
  }, [fetchMessages])

  // SSE
  const connectSSE = useCallback(() => {
    if (sseRef.current) sseRef.current.close()
    setSseStatus('connecting')
    const es = new EventSource(getSSEUrl())
    sseRef.current = es
    es.onopen = () => { setSseStatus('connected'); fetchMessages(setSseMessages, sseInitialLoadRef) }
    es.addEventListener('update', (event) => {
      try {
        const data = JSON.parse(event.data) as Message
        setSseMessages(prev => {
          if (prev.find(m => m.id === data.id)) return prev.map(m => m.id === data.id ? data : m)
          if (!sseInitialLoadRef.current) markAsNew(setSseNewIds, data.id)
          return [...prev, data]
        })
      } catch {}
    })
    es.addEventListener('delete', (event) => {
      try {
        const data = JSON.parse(event.data) as { id: string }
        setSseMessages(prev => prev.filter(m => m.id !== data.id))
      } catch {}
    })
    es.onerror = () => {
      setSseStatus('disconnected')
      es.close()
      sseReconnectRef.current = setTimeout(connectSSE, RECONNECT_DELAY)
    }
  }, [fetchMessages])

  // REST (one-time fetch)
  const fetchRestMessages = useCallback(async () => {
    setRestStatus('connecting')
    try {
      const response = await fetch(`${BASE_URL}/message/?limit=50`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      if (!Array.isArray(data)) { setRestStatus('connected'); return }
      setRestStatus('connected')
      setRestMessages(prevMessages => {
        const prevIds = new Set(prevMessages.map(m => m.id))
        if (!restInitialLoadRef.current) {
          data.filter(msg => !prevIds.has(msg.id)).forEach(msg => markAsNew(setRestNewIds, msg.id))
        } else {
          restInitialLoadRef.current = false
        }
        return data
      })
    } catch (err) {
      setRestStatus('disconnected')
      setError(err instanceof Error ? err.message : 'Failed to fetch')
    }
  }, [])

  // MQTT
  const connectMqtt = useCallback(() => {
    if (mqttRef.current) { mqttRef.current.end(true); mqttRef.current = null }
    setMqttStatus('connecting')
    setMqttMessages([])
    try {
      const client = mqtt.connect(getMqttWsUrl(), {
        username: 'admin',
        password: 'admin123',
        protocolVersion: 5,
        rejectUnauthorized: false,
      })
      mqttRef.current = client
      client.on('connect', () => {
        setMqttStatus('connected')
        client.subscribe('demo-realtime/Message/#')
        client.subscribe('demo-realtime/Message')
        fetchMessages(setMqttMessages, mqttInitialLoadRef)
      })
      client.on('message', (_topic: string, payload: Buffer) => {
        try {
          const msg = JSON.parse(payload.toString())
          const data = msg.data as Message
          const id = msg.id || data?.id
          if (msg.type === 'update' || msg.type === 'retained') {
            setMqttMessages(prev => {
              if (prev.find(m => m.id === id)) return prev.map(m => m.id === id ? data : m)
              if (!mqttInitialLoadRef.current) markAsNew(setMqttNewIds, id)
              return [...prev, data]
            })
          } else if (msg.type === 'delete') {
            setMqttMessages(prev => prev.filter(m => m.id !== id))
          }
        } catch {}
      })
      client.on('error', () => setMqttStatus('disconnected'))
      client.on('close', () => setMqttStatus('disconnected'))
    } catch { setMqttStatus('disconnected') }
  }, [fetchMessages])

  // Connect everything on mount
  useEffect(() => {
    connectWebSocket()
    connectSSE()
    fetchRestMessages()
    connectMqtt()
    return () => {
      if (wsRef.current) wsRef.current.close(1000)
      if (sseRef.current) sseRef.current.close()
      if (wsReconnectRef.current) clearTimeout(wsReconnectRef.current)
      if (sseReconnectRef.current) clearTimeout(sseReconnectRef.current)
      if (mqttRef.current) { mqttRef.current.end(true); mqttRef.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDeleteAll = async () => {
    setShowDeleteModal(false)
    setIsSubmitting(true)
    setError(null)
    try {
      const response = await fetch(`${BASE_URL}/message/?limit=200`)
      if (!response.ok) throw new Error('Failed to fetch')
      const messages = await response.json() as Message[]
      await Promise.all(messages.map(msg =>
        fetch(`${BASE_URL}/message/${msg.id}`, { method: 'DELETE' })
      ))
      setWsMessages([]); setSseMessages([]); setRestMessages([]); setMqttMessages([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally { setIsSubmitting(false) }
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
      if (!response.ok) throw new Error(await response.text() || 'Failed to create')
      setTitle(getRandomSample(SAMPLE_TITLES))
      setContent(getRandomSample(SAMPLE_CONTENTS))
      setShowValidation(false)
      await fetchRestMessages()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally { setIsSubmitting(false) }
  }

  return (
    <>
      <div className="toolbar">
        <div className="toolbar-left" />
        <form onSubmit={handleSubmit} className="toolbar-center">
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
          {error && <span className="toolbar-error">{error}</span>}
        </form>
        <div className="toolbar-right">
          <button onClick={() => setShowDeleteModal(true)} className="btn btn-sm" disabled={isSubmitting}>
            Delete All
          </button>
        </div>
      </div>

      <main className="main-container cols-4">
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

        <div className="panel">
          <div className="panel-header">
            <div className="panel-header-left">
              <StatusDot status={mqttStatus} />
              <span className="panel-title">MQTT/WS</span>
            </div>
            <span className="panel-badge">{mqttMessages.length}</span>
          </div>
          <MessagePanelBody messages={mqttMessages} newIds={mqttNewIds} />
        </div>
      </main>

      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Delete All Messages?</h2>
            <p className="modal-message">This will permanently delete all messages.</p>
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
