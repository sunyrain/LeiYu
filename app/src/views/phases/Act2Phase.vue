<template>
  <div class="page front-page">
    <template v-if="gameState.currentPage === 0">
      <div class="front-panel">
        <div class="countdown-track" aria-hidden="true">
          <span :style="{ width: `${remainingRatio * 100}%` }"></span>
        </div>
        <p>我要离开Ta吗？</p>
        <div class="choices binary-choices">
          <button
            v-for="option in leaveOptions"
            :key="option.value"
            class="choice-btn"
            :class="{ selected: leaveChoice === option.value }"
            @click="selectLeave(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
        <button class="btn" :disabled="!leaveChoice" @click="submitLeave">
          {{ leaveSubmitted ? '已确认' : '确认' }}
        </button>
      </div>
    </template>

    <template v-else-if="gameState.currentPage === 1">
      <div class="front-panel">
        <div class="countdown-track" aria-hidden="true">
          <span :style="{ width: `${remainingRatio * 100}%` }"></span>
        </div>
        <p>Ta要走了，我应该ta？</p>
        <div class="word-grid">
          <button
            v-for="word in departureWords"
            :key="word"
            class="word-chip"
            :class="{ selected: departureChoice === word }"
            @click="departureChoice = word; departureSubmitted = false"
          >
            {{ word }}
          </button>
        </div>
        <button class="btn" :disabled="!departureChoice" @click="submitDeparture">
          {{ departureSubmitted ? '已确认' : '确认' }}
        </button>
      </div>
    </template>

    <template v-else-if="gameState.currentPage === 2">
      <div class="front-panel">
        <div class="countdown-track" aria-hidden="true">
          <span :style="{ width: `${remainingRatio * 100}%` }"></span>
        </div>
        <p>如果Ta重新出现，我应该ta？</p>
        <div class="word-grid">
          <button
            v-for="word in reunionWords"
            :key="word"
            class="word-chip"
            :class="{ selected: reunionChoice === word }"
            @click="reunionChoice = word; reunionSubmitted = false"
          >
            {{ word }}
          </button>
        </div>
        <button class="btn" :disabled="!reunionChoice" @click="submitReunion">
          {{ reunionSubmitted ? '已确认' : '确认' }}
        </button>
      </div>
    </template>

    <template v-else-if="gameState.currentPage === 3">
      <div class="waiting-state">
        <p>请抬头，看向房间。</p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, watch, ref } from 'vue'
import { gameState, setAnswer } from '../../stores/game.js'

const COUNTDOWN_MS = 10000

const leaveChoice = ref(gameState.leaveChoice || '')
const departureChoice = ref(gameState.departureAction || '')
const reunionChoice = ref(gameState.reunionAction || '')
const leaveSubmitted = ref(false)
const departureSubmitted = ref(false)
const reunionSubmitted = ref(false)
const remainingMs = ref(COUNTDOWN_MS)

let rafId = 0
let countdownToken = 0

const leaveOptions = [
  { value: 'yes', label: '要' },
  { value: 'no', label: '不要' },
]

const departureWords = ['挽留', '击打', '无视', '离开', '靠近', '疏远', '放任', '牵制', '刺激', '安抚']
const reunionWords = ['唤醒', '拯救', '遗忘', '理解', '怨恨', '怜悯', '鄙视', '迷惑', '冲击', '控制', '吸引', '爱', '践踏', '珍惜']

const remainingRatio = computed(() => Math.max(0, Math.min(1, remainingMs.value / COUNTDOWN_MS)))

watch(
  () => [gameState.currentPhase, gameState.currentPage],
  ([phase, page]) => {
    if (phase === 'act2' && page >= 0 && page <= 2) {
      startCountdown()
    } else {
      stopCountdown()
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  stopCountdown()
})

function startCountdown() {
  stopCountdown(false)
  remainingMs.value = COUNTDOWN_MS
  const token = ++countdownToken
  const startedAt = performance.now()

  const tick = now => {
    if (token !== countdownToken) return
    const elapsed = now - startedAt
    remainingMs.value = Math.max(0, COUNTDOWN_MS - elapsed)

    if (remainingMs.value <= 0) {
      countdownToken += 1
      rafId = 0
      advancePage()
      return
    }

    rafId = requestAnimationFrame(tick)
  }

  rafId = requestAnimationFrame(tick)
}

function stopCountdown(reset = true) {
  countdownToken += 1
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
  if (reset) remainingMs.value = COUNTDOWN_MS
}

function advancePage() {
  if (gameState.currentPhase !== 'act2') return
  if (gameState.currentPage < 2) {
    gameState.currentPage += 1
    return
  }
  gameState.currentPage = 3
}

function selectLeave(value) {
  leaveChoice.value = value
  leaveSubmitted.value = false
}

function submitLeave() {
  if (!leaveChoice.value) return
  const option = leaveOptions.find(item => item.value === leaveChoice.value)
  setAnswer('leaveChoice', leaveChoice.value, { label: option.label, text: option.label })
  leaveSubmitted.value = true
}

function submitDeparture() {
  if (!departureChoice.value) return
  setAnswer('departureAction', departureChoice.value, { label: departureChoice.value, text: departureChoice.value })
  departureSubmitted.value = true
}

function submitReunion() {
  if (!reunionChoice.value) return
  setAnswer('reunionAction', reunionChoice.value, { label: reunionChoice.value, text: reunionChoice.value })
  reunionSubmitted.value = true
}
</script>

<style scoped>
.front-panel {
  width: min(100%, 430px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.countdown-track {
  width: min(100%, 220px);
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(238, 204, 139, 0.14);
  box-shadow: inset 0 0 0 1px rgba(238, 204, 139, 0.12);
}

.countdown-track span {
  display: block;
  height: 100%;
  width: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, rgba(246, 214, 152, 0.92), rgba(220, 178, 104, 0.7));
  transition: width 0.08s linear;
}

.binary-choices {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.word-grid {
  width: min(100%, 420px);
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
}

.word-chip {
  min-height: 42px;
  padding: 9px 13px;
  border: 1px solid rgba(238, 204, 139, 0.2);
  border-radius: 999px;
  background: rgba(8, 6, 6, 0.34);
  color: #f2eadb;
  font: inherit;
  font-size: 16px;
}

.word-chip.selected {
  border-color: rgba(238, 204, 139, 0.82);
  background: rgba(221, 154, 73, 0.24);
}
</style>
