import { reactive } from 'vue'

export const backendStatus = reactive({
  connected: false,
  role: '',
  serverOrigin: window.location.origin,
  error: '',
  reconnecting: false,
})

const SESSION_KEY = 'fy_session_id'
const ROOM_KEY = 'fy_room_number'
const ADMIN_PIN_KEY = 'fy_admin_pin'

const listeners = {
  state: new Set(),
  stats: new Set(),
  reset: new Set(),
  llmTrigger: new Set(),
  error: new Set(),
}

let ws = null
let role = ''
let reconnectTimer = null
let reconnectAttempts = 0
const queue = []

export function getSessionId() {
  let id = localStorage.getItem(SESSION_KEY)
  if (!id) {
    id = `aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    localStorage.setItem(SESSION_KEY, id)
  }
  return id
}

export function getRoomNumber() {
  return localStorage.getItem(ROOM_KEY) || ''
}

export function getAdminPin() {
  const url = new URL(window.location.href)
  const pin = url.searchParams.get('pin') || sessionStorage.getItem(ADMIN_PIN_KEY) || ''
  if (pin) sessionStorage.setItem(ADMIN_PIN_KEY, pin)
  return pin
}

export function setAdminPin(pin) {
  sessionStorage.setItem(ADMIN_PIN_KEY, String(pin || ''))
}

export function clearAdminPin() {
  sessionStorage.removeItem(ADMIN_PIN_KEY)
}

export function onBackendEvent(type, callback) {
  const set = listeners[type]
  if (!set) return () => {}
  set.add(callback)
  return () => set.delete(callback)
}

export function connectBackend(nextRole = 'audience') {
  role = nextRole
  backendStatus.role = role

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return

  const url = new URL('/ws', window.location.href)
  url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'

  ws = new WebSocket(url)
  backendStatus.reconnecting = reconnectAttempts > 0

  ws.addEventListener('open', () => {
    backendStatus.connected = true
    backendStatus.error = ''
    backendStatus.reconnecting = false
    reconnectAttempts = 0
    sendNow({
      type: 'client:hello',
      payload: {
        role,
        sessionId: getSessionId(),
        roomNumber: getRoomNumber(),
        adminPin: role === 'admin' ? getAdminPin() : '',
      },
    })
    while (queue.length) sendNow(queue.shift())
  })

  ws.addEventListener('message', event => {
    try {
      const message = JSON.parse(event.data)
      handleMessage(message)
    } catch (error) {
      emit('error', { code: 'bad_server_message', message: error.message })
    }
  })

  ws.addEventListener('close', () => {
    backendStatus.connected = false
    scheduleReconnect()
  })

  ws.addEventListener('error', () => {
    backendStatus.error = '无法连接后端'
    emit('error', { code: 'socket_error', message: '无法连接后端' })
  })
}

export function registerAudience(roomNumber) {
  localStorage.setItem(ROOM_KEY, roomNumber)
  sendMessage('audience:join', {
    sessionId: getSessionId(),
    roomNumber,
  })
}

export function clearAudienceRegistration() {
  localStorage.removeItem(ROOM_KEY)
}

export function submitAnswerToBackend(answer) {
  sendMessage('audience:submit-answer', {
    sessionId: getSessionId(),
    roomNumber: getRoomNumber(),
    submittedAt: Date.now(),
    ...answer,
  })
}

export function setShowState(phase, page) {
  sendMessage('admin:set-state', { phase, page })
}

export function resetShow() {
  sendMessage('admin:reset', {})
}

export function triggerLlm() {
  sendMessage('admin:trigger-llm', {})
}

export async function generateMonologue(kind) {
  const response = await fetch('/api/generate-monologue', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-pin': getAdminPin(),
    },
    body: JSON.stringify({ kind }),
  })

  if (!response.ok) throw new Error(`Monologue API error: ${response.status}`)
  return response.json()
}

export async function fetchMonologues() {
  const response = await fetch('/api/monologues', {
    headers: {
      'x-admin-pin': getAdminPin(),
    },
  })

  if (!response.ok) throw new Error(`Monologue API error: ${response.status}`)
  return response.json()
}

function scheduleReconnect() {
  if (reconnectTimer) return
  backendStatus.reconnecting = true
  const delay = Math.min(1000 + reconnectAttempts * 500, 5000)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    reconnectAttempts++
    connectBackend(role || 'audience')
  }, delay)
}

function sendMessage(type, payload) {
  const message = { type, payload }
  if (ws && ws.readyState === WebSocket.OPEN) {
    sendNow(message)
  } else {
    queue.push(message)
    connectBackend(role || 'audience')
  }
}

function sendNow(message) {
  ws.send(JSON.stringify(message))
}

function handleMessage(message) {
  const { type, payload } = message
  if (type === 'server:hello') {
    if (payload?.state) emit('state', payload.state)
    if (payload?.stats) emit('stats', payload.stats)
    return
  }
  if (type === 'server:state') return emit('state', payload)
  if (type === 'server:stats') return emit('stats', payload)
  if (type === 'server:reset') return emit('reset', payload)
  if (type === 'server:llm-trigger') return emit('llmTrigger', payload)
  if (type === 'server:error') return emit('error', payload)
}

function emit(type, payload) {
  const set = listeners[type]
  if (!set) return
  for (const callback of set) callback(payload)
}
