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
  'entryWish',
  'entryChatLog',
  'entryProfile',
  'lovedOneName',
  'leaveChoice',
  'departureAction',
  'reunionAction',
  'roomBase',
  'roomPoemParts',
  'poemMaterials',
]

const savedLocalGame = readLocalGameState()

export const gameState = reactive({
  roomNumber: savedLocalGame.roomNumber || getRoomNumber(),
  entryWish: savedLocalGame.entryWish || '',
  entryChatLog: savedLocalGame.entryChatLog || '',
  entryProfile: savedLocalGame.entryProfile || '',
  lovedOneName: savedLocalGame.lovedOneName || '',
  leaveChoice: savedLocalGame.leaveChoice || '',
  departureAction: savedLocalGame.departureAction || '',
  reunionAction: savedLocalGame.reunionAction || '',
  roomBase: savedLocalGame.roomBase || '',
  roomPoemParts: savedLocalGame.roomPoemParts || '',
  poemMaterials: savedLocalGame.poemMaterials || '',
  currentPhase: 'entry',
  currentPage: 0,
})

let lastRemoteStateAt = 0
let audienceBackendStarted = false
let firstRemoteStateApplied = false
const REMOTE_STATE_VIBRATION_PATTERN = [90, 50, 90]

const optionLabels = {
  leaveChoice: {
    yes: '要',
    no: '不要',
  },
}

const answerMeta = {
  entryWish: { phase: 'entry', questionId: 'entryWish', label: '进场聊天意图' },
  lovedOneName: { phase: 'act1', questionId: 'lovedOneName', label: '心中的名字' },
  leaveChoice: { phase: 'act2', questionId: 'leaveChoice', label: '我要离开Ta吗' },
  departureAction: { phase: 'act2', questionId: 'departureAction', label: 'Ta要走了，你想' },
  reunionAction: { phase: 'act2', questionId: 'reunionAction', label: '如果Ta重新出现，你会' },
  roomBase: { phase: 'act3', questionId: 'roomBase', label: '房间构成' },
  poemMaterials: { phase: 'act3', questionId: 'poemMaterials', label: '扩展词库' },
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
    const isInitialRemoteState = !firstRemoteStateApplied
    const isVisibleStateChange = gameState.currentPhase !== nextPhase || gameState.currentPage !== nextPage

    if (
      isInitialRemoteState
      && typeof window !== 'undefined'
      && isVisibleStateChange
    ) {
      window.__fySkipNextPageScatter = true
    }

    if (!isInitialRemoteState) {
      cueRemoteStateVibration()
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
  gameState.entryWish = ''
  gameState.entryChatLog = ''
  gameState.entryProfile = ''
  gameState.lovedOneName = ''
  gameState.leaveChoice = ''
  gameState.departureAction = ''
  gameState.reunionAction = ''
  gameState.roomBase = ''
  gameState.roomPoemParts = ''
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

function cueRemoteStateVibration() {
  if (typeof navigator === 'undefined') return
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  if (typeof navigator.vibrate !== 'function') return

  try {
    navigator.vibrate(REMOTE_STATE_VIBRATION_PATTERN)
  } catch {
    // Unsupported browsers should ignore this cue without affecting the show.
  }
}

function buildAnswerText(key, value, label) {
  if (key === 'entryWish') return String(value || label || '')
  if (key === 'leaveChoice') return `我要离开Ta吗: ${label}`
  if (key === 'departureAction') return `Ta要走了，我想: ${label}`
  if (key === 'reunionAction') return `如果Ta重新出现，我会: ${label}`
  if (key === 'roomBase') return `房间构成: ${label}`
  if (key === 'poemMaterials') return '已生成扩展词库'
  return String(value || '')
}
