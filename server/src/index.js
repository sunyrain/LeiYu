import http from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { POEM_PROMPT, fallbackMaterials } from './prompt.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..', '..')
const appDist = path.join(projectRoot, 'app', 'dist')
const dataDir = path.join(projectRoot, 'data')
const stateFile = path.join(dataDir, 'show-state.json')
const answersFile = path.join(dataDir, 'answers.json')
const materialsFile = path.join(dataDir, 'materials.json')

loadDotEnv(path.join(projectRoot, '.env'))
loadDotEnv(path.join(projectRoot, 'server', '.env'))

const HOST = process.env.HOST || '0.0.0.0'
const PORT = Number(process.env.PORT || 3000)
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1'
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat'
const OPEN_ADMIN = process.env.FY_OPEN_ADMIN === '1'
const ADMIN_PIN = OPEN_ADMIN ? '' : String(process.env.ADMIN_PIN || '')

const phaseOrder = ['entry', 'prologue', 'act1', 'act2', 'act3', 'act4']
const phaseToAnswerIndex = { act1: 0, act2: 1, act3: 2, act4: 3 }
const WS_OPEN = 1

let showState = {
  phase: 'entry',
  page: 0,
  status: 'running',
  updatedAt: Date.now(),
}

const sessions = new Map()
let answers = []
let generatedMaterials = []

await ensureData()
await loadPersistedData()

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/')) {
      await handleApi(req, res)
      return
    }

    await serveStatic(req, res)
  } catch (error) {
    console.error(error)
    sendJson(res, 500, { error: 'internal_error', message: error.message })
  }
})

const wss = new WebSocketServer({ server, path: '/ws' })

wss.on('connection', (ws, req) => {
  const remoteAddress = req.socket.remoteAddress
  ws.isAlive = true
  ws.meta = {
    role: 'unknown',
    adminAuthorized: false,
    sessionId: '',
    roomNumber: '',
    remoteAddress,
  }

  ws.on('pong', () => {
    ws.isAlive = true
  })

  ws.on('message', raw => {
    try {
      const message = JSON.parse(raw.toString())
      handleWsMessage(ws, message)
    } catch (error) {
      sendWs(ws, 'server:error', { code: 'bad_message', message: error.message })
    }
  })

  ws.on('close', () => {
    if (ws.meta?.sessionId && sessions.has(ws.meta.sessionId)) {
      const session = sessions.get(ws.meta.sessionId)
      session.connected = false
      session.lastSeenAt = Date.now()
      persistStateSoon()
      broadcastStats()
    }
  })

  sendWs(ws, 'server:hello', {
    state: showState,
  })
})

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate()
      continue
    }
    ws.isAlive = false
    ws.ping()
  }
}, 30000)

server.listen(PORT, HOST, () => {
  console.log(`FY show server listening on http://${HOST}:${PORT}`)
  console.log(`Audience: http://<this-computer-ip>:${PORT}/`)
  console.log(`Admin:    http://<this-computer-ip>:${PORT}/admin`)
})

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

async function ensureData() {
  await fsp.mkdir(dataDir, { recursive: true })
}

async function loadPersistedData() {
  showState = await readJson(stateFile, showState)
  answers = await readJson(answersFile, [])
  generatedMaterials = await readJson(materialsFile, [])
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

let persistTimer = null
function persistStateSoon() {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(async () => {
    await Promise.all([
      writeJson(stateFile, showState),
      writeJson(answersFile, answers),
      writeJson(materialsFile, generatedMaterials),
    ])
  }, 100)
}

async function writeJson(file, value) {
  const tmp = `${file}.tmp`
  await fsp.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
  await fsp.rename(tmp, file)
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`)

  if (req.method === 'GET' && url.pathname === '/api/health') {
    const adminAuthorized = isAdminHttpAuthorized(req, url)
    sendJson(res, 200, {
      ok: true,
      state: showState,
      ...(adminAuthorized ? { stats: buildStats() } : {}),
      llmConfigured: Boolean(process.env.DEEPSEEK_API_KEY),
    })
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/state') {
    sendJson(res, 200, { state: showState, stats: buildStats() })
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/answers') {
    if (!isAdminHttpAuthorized(req, url)) return sendJson(res, 401, { error: 'unauthorized' })
    sendJson(res, 200, { answers, stats: buildStats() })
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/export/answers.json') {
    if (!isAdminHttpAuthorized(req, url)) return sendJson(res, 401, { error: 'unauthorized' })
    sendDownload(res, 'answers.json', 'application/json; charset=utf-8', JSON.stringify(answers, null, 2))
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/export/answers.csv') {
    if (!isAdminHttpAuthorized(req, url)) return sendJson(res, 401, { error: 'unauthorized' })
    sendDownload(res, 'answers.csv', 'text/csv; charset=utf-8', toCsv(answers))
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/reset') {
    if (!isAdminHttpAuthorized(req, url)) return sendJson(res, 401, { error: 'unauthorized' })
    resetShow()
    sendJson(res, 200, { ok: true, state: showState, stats: buildStats() })
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/generate-materials') {
    const body = await readBody(req)
    const result = await generateMaterials(body.userContext || body)
    const record = {
      id: makeId('mat'),
      sessionId: body.sessionId || '',
      roomNumber: body.roomNumber || '',
      materials: result.materials,
      fallback: result.fallback,
      error: result.error || '',
      createdAt: Date.now(),
    }
    generatedMaterials.push(record)
    persistStateSoon()
    sendJson(res, 200, result)
    return
  }

  sendJson(res, 404, { error: 'not_found' })
}

async function readBody(req) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

async function generateMaterials(userContext) {
  if (!process.env.DEEPSEEK_API_KEY) {
    return { materials: fallbackMaterials(userContext), fallback: true, error: 'missing_api_key' }
  }

  const userMessage = `观众此前的输入和选择：
- 房间里的三件物：${userContext.floodItem || '未填写'}
- 心中的名字：${userContext.lovedOneName || '未填写'}
- Ta要走了时的反应：${userContext.departureAction || '未选择'}
- Ta重新出现时的反应：${userContext.reunionAction || '未选择'}
- 面对寻人启事的动作：${userContext.noticeAction || '未选择'}
- 河水涨到脚边时的动作：${userContext.riverAction || '未选择'}

请基于以上观众的个人输入，生成拼贴诗素材。`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)

  try {
    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: POEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.9,
        max_tokens: 1024,
      }),
      signal: controller.signal,
    })

    if (!response.ok) throw new Error(`DeepSeek API error: ${response.status}`)
    const data = await response.json()
    const text = String(data.choices?.[0]?.message?.content || '').trim()
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found in response')

    return { materials: JSON.parse(jsonMatch[0]), fallback: false }
  } catch (error) {
    return { materials: fallbackMaterials(userContext), fallback: true, error: error.message }
  } finally {
    clearTimeout(timeout)
  }
}

function handleWsMessage(ws, message) {
  const { type, payload = {} } = message

  if (type === 'client:hello') {
    const role = payload.role === 'admin' ? 'admin' : 'audience'

    if (role === 'admin') {
      if (!isAdminPinValid(payload.adminPin)) {
        ws.meta.role = 'unauthorized-admin'
        ws.meta.adminAuthorized = false
        sendWs(ws, 'server:error', { code: 'unauthorized', message: '后台口令无效' })
        setTimeout(() => ws.close(), 50)
        return
      }
      ws.meta.role = 'admin'
      ws.meta.adminAuthorized = true
    } else {
      ws.meta.role = 'audience'
      ws.meta.adminAuthorized = false
    }

    ws.meta.sessionId = String(payload.sessionId || '')
    ws.meta.roomNumber = String(payload.roomNumber || '')

    if (ws.meta.role === 'audience' && ws.meta.sessionId) {
      upsertSession({
        sessionId: ws.meta.sessionId,
        roomNumber: ws.meta.roomNumber,
        remoteAddress: ws.meta.remoteAddress,
      })
    }

    sendWs(ws, 'server:state', showState)
    if (isAdminWsAuthorized(ws)) sendWs(ws, 'server:stats', buildStats())
    return
  }

  if (type === 'audience:join') {
    ws.meta.role = 'audience'
    ws.meta.sessionId = String(payload.sessionId || ws.meta.sessionId || '')
    ws.meta.roomNumber = String(payload.roomNumber || ws.meta.roomNumber || '')
    upsertSession({
      sessionId: ws.meta.sessionId,
      roomNumber: ws.meta.roomNumber,
      remoteAddress: ws.meta.remoteAddress,
    })
    broadcastStats()
    return
  }

  if (type === 'audience:submit-answer') {
    const answer = normalizeAnswer({ ...payload, remoteAddress: ws.meta.remoteAddress })
    if (!answer.sessionId && ws.meta.sessionId) answer.sessionId = ws.meta.sessionId
    if (!answer.roomNumber && ws.meta.roomNumber) answer.roomNumber = ws.meta.roomNumber
    answers.push(answer)
    if (answer.sessionId) {
      upsertSession({
        sessionId: answer.sessionId,
        roomNumber: answer.roomNumber,
        remoteAddress: ws.meta.remoteAddress,
      })
    }
    persistStateSoon()
    broadcastStats()
    return
  }

  if (type === 'admin:set-state') {
    if (!isAdminWsAuthorized(ws)) return sendWs(ws, 'server:error', { code: 'unauthorized', message: '后台口令无效' })
    setShowState(payload.phase, Number(payload.page || 0))
    return
  }

  if (type === 'admin:reset') {
    if (!isAdminWsAuthorized(ws)) return sendWs(ws, 'server:error', { code: 'unauthorized', message: '后台口令无效' })
    resetShow()
    return
  }

  if (type === 'admin:trigger-llm') {
    if (!isAdminWsAuthorized(ws)) return sendWs(ws, 'server:error', { code: 'unauthorized', message: '后台口令无效' })
    broadcast('server:llm-trigger', { timestamp: Date.now() }, ws => ws.meta?.role === 'audience')
    return
  }

  sendWs(ws, 'server:error', { code: 'unknown_type', message: type })
}

function isAdminPinValid(value) {
  if (!ADMIN_PIN) return true
  return String(value || '') === ADMIN_PIN
}

function isAdminWsAuthorized(ws) {
  return ws.meta?.role === 'admin' && ws.meta?.adminAuthorized === true
}

function isAdminHttpAuthorized(req, url) {
  if (!ADMIN_PIN) return true
  const headerPin = req.headers['x-admin-pin']
  const queryPin = url.searchParams.get('pin')
  return String(headerPin || queryPin || '') === ADMIN_PIN
}

function upsertSession({ sessionId, roomNumber, remoteAddress }) {
  if (!sessionId) return
  const existing = sessions.get(sessionId) || {
    sessionId,
    roomNumber: '',
    joinedAt: Date.now(),
  }
  existing.roomNumber = roomNumber || existing.roomNumber
  existing.remoteAddress = remoteAddress || existing.remoteAddress || ''
  existing.connected = true
  existing.lastSeenAt = Date.now()
  sessions.set(sessionId, existing)
  persistStateSoon()
}

function normalizeAnswer(input) {
  return {
    id: input.id || makeId('ans'),
    sessionId: String(input.sessionId || ''),
    roomNumber: String(input.roomNumber || ''),
    phase: String(input.phase || showState.phase),
    questionId: String(input.questionId || ''),
    label: String(input.label || ''),
    value: String(input.value || ''),
    text: String(input.text || input.label || input.value || ''),
    submittedAt: Number(input.submittedAt || Date.now()),
    remoteAddress: String(input.remoteAddress || ''),
  }
}

function setShowState(phase, page) {
  const safePhase = phaseOrder.includes(phase) ? phase : showState.phase
  showState = {
    ...showState,
    phase: safePhase,
    page: Math.max(0, Number.isFinite(page) ? page : 0),
    updatedAt: Date.now(),
  }
  persistStateSoon()
  broadcast('server:state', showState)
  broadcastStats()
}

function resetShow() {
  showState = {
    phase: 'entry',
    page: 0,
    status: 'running',
    updatedAt: Date.now(),
  }
  answers = []
  generatedMaterials = []
  sessions.clear()
  persistStateSoon()
  broadcast('server:reset', { state: showState })
  broadcast('server:state', showState)
  broadcastStats()
}

function buildStats() {
  const connectedAudience = [...sessions.values()].filter(s => s.connected)
  const perPhase = { act1: 0, act2: 0, act3: 0, act4: 0 }
  const groupedAnswers = [[], [], [], []]

  for (const answer of answers) {
    if (perPhase[answer.phase] !== undefined) perPhase[answer.phase]++
    const index = phaseToAnswerIndex[answer.phase]
    if (index !== undefined) {
      groupedAnswers[index].push({
        room: answer.roomNumber || '未知',
        text: answer.text || answer.label || answer.value,
        questionId: answer.questionId,
        label: answer.label,
        value: answer.value,
        time: answer.submittedAt,
      })
    }
  }

  const audienceCount = connectedAudience.length
  const completedSessions = new Set(
    answers.filter(answer => answer.phase === 'act4' && answer.questionId === 'finalAction').map(answer => answer.sessionId)
  )

  return {
    audienceCount,
    totalSubmissions: answers.length,
    currentRoundSubmissions: perPhase[showState.phase] || 0,
    completionRate: audienceCount ? Math.round((completedSessions.size / audienceCount) * 100) : 0,
    perPhase,
    answers: groupedAnswers,
    generatedCount: generatedMaterials.length,
    updatedAt: Date.now(),
  }
}

function broadcastStats() {
  broadcast('server:stats', buildStats(), ws => isAdminWsAuthorized(ws))
}

function sendWs(ws, type, payload) {
  if (ws.readyState !== WS_OPEN) return
  ws.send(JSON.stringify({ type, payload }))
}

function broadcast(type, payload, predicate = () => true) {
  for (const ws of wss.clients) {
    if (ws.readyState === WS_OPEN && predicate(ws)) sendWs(ws, type, payload)
  }
}

async function serveStatic(req, res) {
  if (!fs.existsSync(appDist)) {
    sendHtml(res, 503, `<h1>前端尚未构建</h1><p>请先运行 <code>npm run build</code>。</p>`)
    return
  }

  const url = new URL(req.url, `http://${req.headers.host}`)
  let pathname = decodeURIComponent(url.pathname)
  if (pathname === '/') pathname = '/index.html'
  const requested = path.normalize(path.join(appDist, pathname))

  if (!requested.startsWith(appDist)) {
    sendJson(res, 403, { error: 'forbidden' })
    return
  }

  let file = requested
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(appDist, 'index.html')
  }

  const data = await fsp.readFile(file)
  res.writeHead(200, {
    'Content-Type': contentType(file),
    'Cache-Control': file.endsWith('index.html') ? 'no-store' : 'public, max-age=3600',
  })
  res.end(data)
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(JSON.stringify(payload))
}

function sendDownload(res, filename, type, body) {
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Disposition': `attachment; filename="${filename}"`,
  })
  res.end(body)
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(html)
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase()
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.json': 'application/json; charset=utf-8',
  }
  return types[ext] || 'application/octet-stream'
}

function toCsv(rows) {
  const header = ['id', 'sessionId', 'roomNumber', 'phase', 'questionId', 'label', 'value', 'text', 'submittedAt']
  const lines = [header.join(',')]
  for (const row of rows) {
    lines.push(header.map(key => csvCell(row[key])).join(','))
  }
  return `\ufeff${lines.join('\n')}`
}

function csvCell(value) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
