import { reactive } from 'vue'
import {
  clearAudienceRegistration,
  connectBackend,
  getRoomNumber,
  onBackendEvent,
  registerAudience,
  submitAnswerToBackend,
} from '../services/backend.js'

const LOCAL_GAME_KEY = 'fy_game_state'
const localAnswerKeys = [
  'roomNumber',
  'floodItem',
  'lovedOneName',
  'departureAction',
  'reunionAction',
  'noticeAction',
  'riverAction',
  'roomBase',
  'roomPoemParts',
  'identity',
  'mirrorSelf',
  'finalTransform',
  'objectAction',
  'finalAction',
  'poemMaterials',
]

const savedLocalGame = readLocalGameState()

export const gameState = reactive({
  roomNumber: savedLocalGame.roomNumber || getRoomNumber(),
  floodItem: savedLocalGame.floodItem || '',
  lovedOneName: savedLocalGame.lovedOneName || '',
  departureAction: savedLocalGame.departureAction || '',
  reunionAction: savedLocalGame.reunionAction || '',
  noticeAction: savedLocalGame.noticeAction || '',
  riverAction: savedLocalGame.riverAction || '',
  roomBase: savedLocalGame.roomBase || '',
  roomPoemParts: savedLocalGame.roomPoemParts || '',
  identity: savedLocalGame.identity || '',
  mirrorSelf: savedLocalGame.mirrorSelf || '',
  finalTransform: savedLocalGame.finalTransform || '',
  objectAction: savedLocalGame.objectAction || '',
  finalAction: savedLocalGame.finalAction || '',
  poemMaterials: savedLocalGame.poemMaterials || '',
  currentPhase: 'entry',
  currentPage: 0,
})

let lastRemoteStateAt = 0
let audienceBackendStarted = false
let firstRemoteStateApplied = false

const optionLabels = {
  departureAction: {
    A: '抬头仰望',
    B: '抱紧自己',
    C: '向外探望',
    D: '用力跺脚',
  },
  reunionAction: {
    A: '盯住ta',
    B: '停住',
    C: '快速扑向ta',
    D: '等待ta靠近',
  },
  noticeAction: {
    A: '撕碎它',
    B: '折起来，继续握着',
    C: '松手，让它落下',
    D: '贴回窗边',
  },
  riverAction: {
    A: '跳进去',
    B: '抓住什么',
    C: '闭上眼睛',
    D: '看着它',
  },
  identity: {
    A: '稳稳地站住脚跟',
    B: '不止地颤栗起来',
    C: '阔步向门外走去',
    D: '安心地闭上眼睛',
  },
  mirrorSelf: {
    A: '一个站稳的人',
    B: '一个还在发抖的人',
    C: '一个准备离开的人',
    D: '一个只是看着的人',
  },
  finalTransform: {
    A: '新鲜的光影',
    B: '昨日的午餐',
    C: '耳边的轻痣',
    D: '渐远的雨声',
  },
  objectAction: {
    A: '打开门',
    B: '躺下',
    C: '站着不动',
    D: '开始收拾东西',
  },
  finalAction: {
    A: '轻轻地笑了',
    B: '再次睡去',
    C: '久久站立',
  },
}

const answerMeta = {
  floodItem: { phase: 'act1', questionId: 'floodItem', label: '洪水中带走的三件物' },
  lovedOneName: { phase: 'act1', questionId: 'lovedOneName', label: '心中的名字' },
  departureAction: { phase: 'act1', questionId: 'departureAction', label: 'Ta要走了，你想' },
  reunionAction: { phase: 'act1', questionId: 'reunionAction', label: '如果Ta重新出现，你会' },
  noticeAction: { phase: 'act2', questionId: 'noticeAction', label: '你忽然想要' },
  riverAction: { phase: 'act2', questionId: 'riverAction', label: '河水涨到脚边，你不得不' },
  roomBase: { phase: 'act3', questionId: 'roomBase', label: '房间构成' },
  identity: { phase: 'act3', questionId: 'identity', label: '看见房间后，你' },
  poemMaterials: { phase: 'act3', questionId: 'poemMaterials', label: 'LLM 生成素材' },
  mirrorSelf: { phase: 'act4', questionId: 'mirrorSelf', label: '镜子里是' },
  finalTransform: { phase: 'act4', questionId: 'finalTransform', label: '名字正在变成' },
  objectAction: { phase: 'act4', questionId: 'objectAction', label: '物件亮晶晶的，你' },
  finalAction: { phase: 'act4', questionId: 'finalAction', label: '最终结局' },
}

export function setAnswer(key, value, details = {}) {
  gameState[key] = value
  persistLocalGameState()

  if (key === 'roomNumber') {
    registerAudience(value)
    return
  }

  const meta = answerMeta[key]
  if (!meta || !gameState.roomNumber) return

  const label = details.label || optionLabels[key]?.[value] || meta.label
  const text = details.text || buildAnswerText(key, value, label)
  submitAnswerToBackend({
    roomNumber: gameState.roomNumber,
    phase: meta.phase,
    questionId: meta.questionId,
    label,
    value,
    text,
  })
}

export function nextPage() {
  gameState.currentPage++
}

export function previousPage() {
  gameState.currentPage = Math.max(0, gameState.currentPage - 1)
}

export function goToPhase(phase) {
  gameState.currentPhase = phase
  gameState.currentPage = 0
}

export function initAudienceBackend() {
  if (audienceBackendStarted) return
  audienceBackendStarted = true

  connectBackend('audience')
  if (gameState.roomNumber) registerAudience(gameState.roomNumber)

  onBackendEvent('state', state => {
    if (!state || state.updatedAt === lastRemoteStateAt) return
    lastRemoteStateAt = state.updatedAt
    const nextPhase = state.phase || 'entry'
    const nextPage = Number(state.page || 0)

    if (
      !firstRemoteStateApplied
      && typeof window !== 'undefined'
      && (gameState.currentPhase !== nextPhase || gameState.currentPage !== nextPage)
    ) {
      window.__fySkipNextPageScatter = true
    }

    firstRemoteStateApplied = true
    gameState.currentPhase = nextPhase
    gameState.currentPage = nextPage
  })

  onBackendEvent('reset', () => {
    resetLocalGame()
  })
}

function resetLocalGame() {
  clearLocalGameState()
  clearAudienceRegistration()
  gameState.roomNumber = ''
  gameState.floodItem = ''
  gameState.lovedOneName = ''
  gameState.departureAction = ''
  gameState.reunionAction = ''
  gameState.noticeAction = ''
  gameState.riverAction = ''
  gameState.roomBase = ''
  gameState.roomPoemParts = ''
  gameState.identity = ''
  gameState.mirrorSelf = ''
  gameState.finalTransform = ''
  gameState.objectAction = ''
  gameState.finalAction = ''
  gameState.poemMaterials = ''
  gameState.currentPhase = 'entry'
  gameState.currentPage = 0
  firstRemoteStateApplied = false
}

function readLocalGameState() {
  if (typeof localStorage === 'undefined') return {}
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_GAME_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function persistLocalGameState() {
  if (typeof localStorage === 'undefined') return
  const snapshot = {}
  localAnswerKeys.forEach(key => {
    snapshot[key] = String(gameState[key] || '')
  })
  localStorage.setItem(LOCAL_GAME_KEY, JSON.stringify(snapshot))
}

function clearLocalGameState() {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(LOCAL_GAME_KEY)
}

function buildAnswerText(key, value, label) {
  if (key === 'departureAction') return `Ta要走了，我想: ${label}`
  if (key === 'reunionAction') return `如果Ta重新出现，我会: ${label}`
  if (key === 'noticeAction') return `我忽然想要: ${label}`
  if (key === 'riverAction') return `河水涨到脚边，我不得不: ${label}`
  if (key === 'roomBase') return `房间构成: ${label}`
  if (key === 'identity') return `看见房间后，我: ${label}`
  if (key === 'mirrorSelf') return `镜子里是: ${label}`
  if (key === 'finalTransform') return `${gameState.lovedOneName || '那个名字'}正在变成: ${label}`
  if (key === 'objectAction') return `物件亮晶晶的，我: ${label}`
  if (key === 'finalAction') return label
  if (key === 'poemMaterials') return '已生成拼贴诗素材'
  return String(value || '')
}
