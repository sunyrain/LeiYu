import http from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { MONOLOGUE3_FIXED_ENDING, MONOLOGUE_PROMPTS, fallbackMonologue } from './prompt.js'
import {
  ENTRY_PROFILE_PROMPT,
  FRONT_POEM_SLOT_PROMPTS,
  TALK_PROMPT,
  fallbackEntryProfile,
  fallbackPoemBlocks,
  fallbackTalkReply,
} from './talk-prompt.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..', '..')
const appDist = path.join(projectRoot, 'app', 'dist')
const dataDir = path.join(projectRoot, 'data')
const stateFile = path.join(dataDir, 'show-state.json')
const answersFile = path.join(dataDir, 'answers.json')
const monologuesFile = path.join(dataDir, 'monologues.json')

loadDotEnv(path.join(projectRoot, '.env'))
loadDotEnv(path.join(projectRoot, 'server', '.env'))

const HOST = process.env.HOST || '0.0.0.0'
const PORT = Number(process.env.PORT || 3000)
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1'
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat'
const ADMIN_PIN = String(process.env.ADMIN_PIN || '')

const phaseOrder = ['entry', 'act1', 'act2', 'act3']
const phaseToAnswerIndex = { entry: 0, act1: 1, act2: 2, act3: 3 }
const currentQuestionIds = new Set([
  'entryWish',
  'lovedOneName',
  'leaveChoice',
  'departureAction',
  'reunionAction',
  'roomBase',
  'poemMaterials',
])
const monologueQuestionGroups = {
  monologue1: ['lovedOneName'],
  monologue2: [],
  monologue3: ['roomBase'],
}
const WS_OPEN = 1

let showState = {
  phase: 'entry',
  page: 0,
  status: 'running',
  updatedAt: Date.now(),
}

const sessions = new Map()
let answers = []
let generatedMonologues = []

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
  showState = normalizeShowState(showState)
  answers = filterCurrentAnswers(await readJson(answersFile, []))
  generatedMonologues = await readJson(monologuesFile, [])
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
      writeJson(monologuesFile, generatedMonologues),
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

  if (req.method === 'GET' && url.pathname === '/api/monologues') {
    if (!isAdminHttpAuthorized(req, url)) return sendJson(res, 401, { error: 'unauthorized' })
    sendJson(res, 200, { monologues: generatedMonologues, latest: latestMonologuesByKind() })
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

  if (req.method === 'GET' && url.pathname === '/api/export/monologues.json') {
    if (!isAdminHttpAuthorized(req, url)) return sendJson(res, 401, { error: 'unauthorized' })
    sendDownload(res, 'monologues.json', 'application/json; charset=utf-8', JSON.stringify(generatedMonologues, null, 2))
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/reset') {
    if (!isAdminHttpAuthorized(req, url)) return sendJson(res, 401, { error: 'unauthorized' })
    resetShow()
    sendJson(res, 200, { ok: true, state: showState, stats: buildStats() })
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/generate-monologue') {
    if (!isAdminHttpAuthorized(req, url)) return sendJson(res, 401, { error: 'unauthorized' })
    const body = await readBody(req)
    const result = await generateMonologue(body.kind || body.type || 'monologue1')
    const record = {
      id: makeId('mono'),
      kind: result.kind,
      label: result.label,
      text: result.text,
      fallback: result.fallback,
      error: result.error || '',
      sourceCount: result.sourceCount || 0,
      createdAt: Date.now(),
    }
    generatedMonologues.push(record)
    persistStateSoon()
    broadcastStats()
    sendJson(res, 200, { ...result, record })
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/talk-chat') {
    const body = await readBody(req)
    const messages = normalizeTalkMessages(body.messages || body.conversation || [])
    if (!messages.length) {
      sendJson(res, 400, { error: 'bad_request', message: 'messages required' })
      return
    }

    const result = await generateTalkReply(messages)
    sendJson(res, 200, result)
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/extract-entry-profile') {
    const body = await readBody(req)
    const messages = normalizeTalkMessages(body.messages || body.conversation || [])
    const result = await extractEntryProfile(messages)
    sendJson(res, 200, result)
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/generate-front-poem-blocks') {
    const body = await readBody(req)
    const result = await generateFrontPoemBlocks(body)
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

async function generateMonologue(kind) {
  const prompt = MONOLOGUE_PROMPTS[kind]
  if (!prompt) throw new Error(`Unknown monologue kind: ${kind}`)

  const sourceAnswers = answersForMonologue(kind)
  const userInput = formatAnswersForPrompt(sourceAnswers)

  if (kind === 'monologue1') {
    return {
      kind,
      label: prompt.label,
      text: buildNameCallMonologue(sourceAnswers),
      fallback: false,
      sourceCount: sourceAnswers.length,
    }
  }

  if (!process.env.DEEPSEEK_API_KEY) {
    return {
      kind,
      label: prompt.label,
      text: postProcessMonologue(kind, fallbackMonologue(kind, userInput), sourceAnswers),
      fallback: true,
      error: 'missing_api_key',
      sourceCount: sourceAnswers.length,
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 18000)

  try {
    const text = await requestChatText({
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user(userInput) },
      ],
      temperature: kind === 'monologue2' ? 1 : 0.86,
      maxTokens: kind === 'monologue2' ? 420 : 900,
      signal: controller.signal,
    })
    return {
      kind,
      label: prompt.label,
      text: postProcessMonologue(kind, text, sourceAnswers),
      fallback: false,
      sourceCount: sourceAnswers.length,
    }
  } catch (error) {
    return {
      kind,
      label: prompt.label,
      text: postProcessMonologue(kind, fallbackMonologue(kind, userInput), sourceAnswers),
      fallback: true,
      error: error.message,
      sourceCount: sourceAnswers.length,
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function generateTalkReply(messages) {
  if (!process.env.DEEPSEEK_API_KEY) {
    return {
      reply: fallbackTalkReply(messages),
      fallback: true,
      error: 'missing_api_key',
      sourceCount: messages.length,
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 18000)

  try {
    const text = await requestChatText({
      messages: [
        { role: 'system', content: TALK_PROMPT },
        ...messages,
      ],
      temperature: 0.88,
      maxTokens: 360,
      signal: controller.signal,
    })
    return {
      reply: cleanTalkReply(text),
      fallback: false,
      sourceCount: messages.length,
    }
  } catch (error) {
    return {
      reply: fallbackTalkReply(messages),
      fallback: true,
      error: error.message,
      sourceCount: messages.length,
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function extractEntryProfile(messages) {
  const fallback = normalizeEntryProfile(fallbackEntryProfile(messages), {})
  if (!messages.length) {
    return { profile: fallback, fallback: true, error: 'messages_required' }
  }

  if (!process.env.DEEPSEEK_API_KEY) {
    return { profile: fallback, fallback: true, error: 'missing_api_key' }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)

  try {
    const text = await requestChatText({
      messages: [
        { role: 'system', content: ENTRY_PROFILE_PROMPT },
        { role: 'user', content: formatTalkMessagesForProfile(messages) },
      ],
      temperature: 0.28,
      maxTokens: 260,
      signal: controller.signal,
    })
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found in response')
    return {
      profile: normalizeEntryProfile(JSON.parse(jsonMatch[0]), fallback),
      fallback: false,
    }
  } catch (error) {
    return { profile: fallback, fallback: true, error: error.message }
  } finally {
    clearTimeout(timeout)
  }
}

async function generateFrontPoemBlocks(userContext) {
  const fallback = fallbackPoemBlocks(userContext)
  if (!process.env.DEEPSEEK_API_KEY) {
    return { blocks: fallback, fallback: true, error: 'missing_api_key' }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 22000)

  try {
    const context = formatFrontPoemContext(userContext)
    const [want, belief, texture] = await Promise.all([
      generateFrontPoemSlot('want', context, fallback.want, controller.signal),
      generateFrontPoemSlot('belief', context, fallback.belief, controller.signal),
      generateFrontPoemSlot('texture', context, fallback.texture, controller.signal),
    ])

    return {
      blocks: {
        want,
        belief,
        texture,
        wild: [],
      },
      fallback: false,
    }
  } catch (error) {
    return { blocks: fallback, fallback: true, error: error.message }
  } finally {
    clearTimeout(timeout)
  }
}

async function generateFrontPoemSlot(kind, context, fallback, signal) {
  const prompt = FRONT_POEM_SLOT_PROMPTS[kind]
  if (!prompt) return normalizeSlotItems([], fallback, kind)

  const text = await requestChatText({
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: context },
    ],
    temperature: kind === 'texture' ? 0.82 : 0.88,
    maxTokens: 320,
    signal,
  })

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`No JSON found in ${kind} response`)
  const parsed = JSON.parse(jsonMatch[0])
  return normalizeSlotItems(parsed.items, fallback, kind)
}

function formatFrontPoemContext(userContext) {
  return [
    `观众进场聊天内容：${userContext.entryWish || userContext.prompt || '未填写'}`,
    `观众进场聊天全文：${formatEntryChatLogForPrompt(userContext.entryChatLog)}`,
    `观众画像：${formatEntryProfileForPrompt(userContext.entryProfile)}`,
  ].join('\n')
}

function postProcessMonologue(kind, text, sourceAnswers) {
  if (kind === 'monologue1') return buildNameCallMonologue(sourceAnswers)
  if (kind === 'monologue3') return enforceMonologue3Ending(text)
  return cleanMonologueText(text)
}

function buildNameCallMonologue(sourceAnswers) {
  const names = extractAudienceNames(sourceAnswers)
  const fallbackNames = ['那个名字', '旧日的人', '门外的人', '你']
  const selected = []
  const seen = new Set()

  for (const name of [...names, ...fallbackNames]) {
    const key = name.toLocaleLowerCase('zh-CN')
    if (seen.has(key)) continue
    seen.add(key)
    selected.push(name)
    if (selected.length >= 4) break
  }

  const [first, second, third, fourth] = selected
  return `${first}，回来吧……${second}，这次算我求你。你在哪儿？回来，好吗？${third}，${fourth}……`
}

function extractAudienceNames(sourceAnswers) {
  const invalidNames = new Set(['无', '没有', '暂无', '未填写', '不知道', '不想说', '匿名', '无名', 'none', 'null'])
  const names = []
  const seen = new Set()

  for (const answer of [...sourceAnswers].reverse()) {
    const raw = String(answer.text || answer.label || answer.value || '')
    const candidates = raw.split(/[、,，;；/|｜\n\r]+/)
    for (const candidate of candidates) {
      const name = cleanAudienceName(candidate)
      if (!name || invalidNames.has(name.toLocaleLowerCase('zh-CN'))) continue
      const key = name.toLocaleLowerCase('zh-CN')
      if (seen.has(key)) continue
      seen.add(key)
      names.push(name)
    }
  }

  return names
}

function cleanAudienceName(value) {
  const name = String(value || '')
    .replace(/^[-*\s]+/, '')
    .replace(/^[^:：]*[:：]\s*/, '')
    .replace(/[“”"「」『』《》[\]()（）]/g, '')
    .replace(/\s+/g, '')
    .replace(/[。.!！?？…]+$/g, '')
    .trim()

  if (!name || name.includes('_')) return ''
  if (name.length > 12) return ''
  if (/^(未|没|无|不)/.test(name) && name.length <= 4) return ''
  return name
}

function enforceMonologue3Ending(text) {
  let prefix = cleanMonologueText(text)
  const endingMarkers = [
    '我没告诉ta雨没停',
    '我没告诉他雨没停',
    '我没告诉她雨没停',
    '但我们都应该收拾出来一件自己的房间',
  ]
  const markerIndex = endingMarkers
    .map(marker => prefix.indexOf(marker))
    .filter(index => index >= 0)
    .sort((a, b) => a - b)[0]

  if (markerIndex !== undefined) prefix = prefix.slice(0, markerIndex)
  prefix = prefix.replace(/[“”"「」『』\s]+$/g, '').trim()
  if (prefix && !/[。！？…]$/.test(prefix)) prefix += '。'
  return `${prefix}${MONOLOGUE3_FIXED_ENDING}`
}

function cleanMonologueText(text) {
  return String(text || '')
    .replace(/^```[a-zA-Z]*\s*/, '')
    .replace(/```$/g, '')
    .replace(/^[“”"「」『』]+|[“”"「」『』]+$/g, '')
    .trim()
}

async function requestChatText({ messages, temperature, maxTokens, signal }) {
  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
    signal,
  })

  if (!response.ok) throw new Error(`DeepSeek API error: ${response.status}`)
  const data = await response.json()
  const text = String(data.choices?.[0]?.message?.content || '').trim()
  if (!text) throw new Error('Empty LLM response')
  return text
}

function answersForMonologue(kind) {
  const allowed = new Set(monologueQuestionGroups[kind] || [])
  return answers
    .filter(answer => allowed.has(answer.questionId))
    .slice(-80)
}

function formatAnswersForPrompt(sourceAnswers) {
  if (!sourceAnswers.length) return '暂无观众提交。'
  return sourceAnswers
    .map(answer => {
      const room = answer.roomNumber ? `${answer.roomNumber}号` : '未知房间'
      const label = answer.label || answer.value || ''
      const text = answer.text || label
      return `- ${room} / ${answer.questionId}: ${text}`
    })
    .join('\n')
}

function normalizeTalkMessages(messages) {
  if (!Array.isArray(messages)) return []

  return messages
    .filter(message => message && (message.role === 'user' || message.role === 'assistant'))
    .map(message => ({
      role: message.role,
      content: String(message.content || '').trim().slice(0, 1200),
    }))
    .filter(message => message.content)
    .slice(-16)
}

function cleanTalkReply(text) {
  return String(text || '')
    .replace(/^```[a-zA-Z]*\s*/, '')
    .replace(/```$/g, '')
    .replace(/^[\s"“”'‘’`]+|[\s"“”'‘’`]+$/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function formatTalkMessagesForProfile(messages) {
  return messages
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .map(message => `${message.role === 'assistant' ? '繁漪' : '观众'}：${message.content}`)
    .join('\n')
}

function formatEntryProfileForPrompt(profile) {
  const normalized = normalizeEntryProfile(profile, {})
  if (!Object.values(normalized).some(value => Array.isArray(value) ? value.length : value)) {
    return '未提取'
  }
  return JSON.stringify(normalized)
}

function formatEntryChatLogForPrompt(value) {
  const messages = parseEntryChatLog(value)
  if (!messages.length) return '未保存'
  return messages
    .map(message => `${message.role === 'assistant' ? '繁漪' : '观众'}：${message.content}`)
    .join('\n')
}

function parseEntryChatLog(value) {
  let raw = value
  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(raw)) return []
  return raw
    .filter(message => message && (message.role === 'user' || message.role === 'assistant'))
    .map(message => ({
      role: message.role,
      content: String(message.content || '').trim().slice(0, 800),
    }))
    .filter(message => message.content)
    .slice(-16)
}

function normalizeEntryProfile(value, fallback = {}) {
  const source = parseEntryProfile(value)
  return {
    desire: compactProfileText(source.desire || fallback.desire, 14),
    mood: compactProfileText(source.mood || fallback.mood, 10),
    imagery: normalizeProfileImagery(source.imagery || fallback.imagery),
    tendency: compactProfileText(source.tendency || fallback.tendency, 12),
    quote: compactProfileText(source.quote || fallback.quote, 24),
  }
}

function parseEntryProfile(value) {
  if (!value) return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }
  return typeof value === 'object' ? value : {}
}

function normalizeProfileImagery(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  const result = []
  for (const item of value) {
    const text = compactProfileText(item, 8)
    if (!text || seen.has(text)) continue
    seen.add(text)
    result.push(text)
    if (result.length >= 4) break
  }
  return result
}

function compactProfileText(value, maxLength) {
  return String(value || '')
    .replace(/["'“”‘’{}[\]]/g, '')
    .replace(/\s+/g, '')
    .trim()
    .slice(0, maxLength)
}

function normalizeSlotItems(items, fallback, kind) {
  const seen = new Set()
  const result = []
  for (const item of [...(Array.isArray(items) ? items : []), ...(fallback || [])]) {
    const text = normalizeGeneratedWord(item)
    if (!text || seen.has(text)) continue
    seen.add(text)
    result.push(text)
    if (result.length >= 8) break
  }
  return result
}

function normalizeGeneratedWord(value) {
  return String(value || '')
    .replace(/[，。；、,.!?！？;:\s]+/g, '')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .trim()
    .slice(0, 12)
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
    upsertAnswer(answer)
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

function upsertAnswer(answer) {
  if (!answer.questionId || !isCurrentAnswer(answer)) return

  const matchesSameAnswer = current => {
    if (answer.sessionId && current.sessionId) {
      return current.sessionId === answer.sessionId && current.questionId === answer.questionId
    }
    if (answer.roomNumber && current.roomNumber) {
      return current.roomNumber === answer.roomNumber && current.questionId === answer.questionId
    }
    return false
  }

  answers = answers.filter(current => !matchesSameAnswer(current))
  answers.push(answer)
}

function isCurrentAnswer(answer) {
  return answer && currentQuestionIds.has(String(answer.questionId || ''))
}

function filterCurrentAnswers(list) {
  if (!Array.isArray(list)) return []
  return list.filter(isCurrentAnswer)
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
  const safePage = clampShowPage(safePhase, page)
  showState = {
    ...showState,
    phase: safePhase,
    page: safePage,
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
  generatedMonologues = []
  sessions.clear()
  persistStateSoon()
  broadcast('server:reset', { state: showState })
  broadcast('server:state', showState)
  broadcastStats()
}

function buildStats() {
  const connectedAudience = [...sessions.values()].filter(s => s.connected)
  const audienceTotal = getAudienceTotal()
  const perPhase = { entry: 0, act1: 0, act2: 0, act3: 0 }
  const groupedAnswers = [[], [], [], []]

  for (const answer of answers) {
    if (perPhase[answer.phase] !== undefined) perPhase[answer.phase]++
    const index = phaseToAnswerIndex[answer.phase]
    if (index !== undefined) {
      groupedAnswers[index].push({
        room: answer.roomNumber || '未知',
        sessionId: answer.sessionId || '',
        sessionCode: getSessionCode(answer.sessionId),
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
    answers.filter(answer => answer.phase === 'act3' && answer.questionId === 'roomBase').map(answer => answer.sessionId)
  )

  return {
    audienceCount,
    audienceTotal,
    totalSubmissions: answers.length,
    currentRoundSubmissions: perPhase[showState.phase] || 0,
    completionRate: audienceTotal ? Math.round((completedSessions.size / audienceTotal) * 100) : 0,
    perPhase,
    answers: groupedAnswers,
    questionCompletion: buildQuestionCompletion(audienceTotal),
    monologueReadiness: buildMonologueReadiness(audienceTotal),
    monologueCount: generatedMonologues.length,
    monologues: latestMonologuesByKind(),
    updatedAt: Date.now(),
  }
}

function getAudienceTotal() {
  const knownSessions = new Set()
  for (const session of sessions.values()) {
    if (session.sessionId && (session.roomNumber || session.connected)) knownSessions.add(session.sessionId)
  }
  for (const answer of answers) {
    if (answer.sessionId) knownSessions.add(answer.sessionId)
    else if (answer.roomNumber) knownSessions.add(`room:${answer.roomNumber}`)
  }
  return knownSessions.size
}

function buildQuestionCompletion(audienceTotal) {
  const byQuestion = new Map()
  for (const answer of answers) {
    if (!answer.questionId) continue
    if (!byQuestion.has(answer.questionId)) byQuestion.set(answer.questionId, new Set())
    byQuestion.get(answer.questionId).add(answer.sessionId || `room:${answer.roomNumber || answer.id}`)
  }

  const result = {}
  for (const [questionId, users] of byQuestion.entries()) {
    result[questionId] = {
      answered: users.size,
      total: audienceTotal,
      rate: audienceTotal ? Math.round((users.size / audienceTotal) * 100) : 0,
    }
  }
  return result
}

function buildMonologueReadiness(audienceTotal) {
  const questionCompletion = buildQuestionCompletion(audienceTotal)
  return Object.entries(monologueQuestionGroups).reduce((result, [kind, questions]) => {
    if (!questions.length) {
      result[kind] = {
        questions,
        details: [],
        answered: 0,
        total: 0,
        rate: 100,
        minRate: 100,
        missingQuestions: [],
      }
      return result
    }

    const details = questions.map(questionId => ({
      questionId,
      ...(questionCompletion[questionId] || { answered: 0, total: audienceTotal, rate: 0 }),
    }))
    const answeredTotal = details.reduce((sum, item) => sum + item.answered, 0)
    const requiredTotal = audienceTotal * questions.length
    result[kind] = {
      questions,
      details,
      answered: answeredTotal,
      total: requiredTotal,
      rate: requiredTotal ? Math.round((answeredTotal / requiredTotal) * 100) : 0,
      minRate: details.length ? Math.min(...details.map(item => item.rate)) : 0,
      missingQuestions: details.filter(item => item.rate === 0).map(item => item.questionId),
    }
    return result
  }, {})
}

function getSessionCode(sessionId) {
  const value = String(sessionId || '')
  if (!value) return ''
  return value.slice(-6).toUpperCase()
}

function latestMonologuesByKind() {
  return ['monologue1', 'monologue2', 'monologue3'].reduce((result, kind) => {
    result[kind] = [...generatedMonologues].reverse().find(item => item.kind === kind) || null
    return result
  }, {})
}

function normalizeShowState(state) {
  const phase = phaseOrder.includes(state?.phase) ? state.phase : 'entry'
  const page = clampShowPage(phase, state?.page)
  return {
    phase,
    page,
    status: String(state?.status || 'running'),
    updatedAt: Number(state?.updatedAt || Date.now()),
  }
}

function clampShowPage(phase, page) {
  const maxPage = phase === 'entry' ? 4 : phase === 'act1' ? 2 : phase === 'act2' ? 3 : 2
  const value = Number.isFinite(Number(page)) ? Number(page) : 0
  return Math.max(0, Math.min(value, maxPage))
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
