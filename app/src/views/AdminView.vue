<template>
  <div v-if="!adminUnlocked" class="admin-login">
    <form class="admin-login-card" @submit.prevent="unlockAdmin">
      <h1>舞监控制台</h1>
      <p>请输入本次演出的后台口令。</p>
      <input
        v-model="pinInput"
        type="password"
        placeholder="后台口令"
        autocomplete="current-password"
      />
      <button type="submit">进入</button>
      <div v-if="authError" class="auth-error">{{ authError }}</div>
    </form>
  </div>
  <div v-else class="admin-panel">
    <header class="admin-header">
      <h1>舞监控制台</h1>
      <div class="status-bar">
        <span class="status-dot" :class="{ active: connected }"></span>
        <span>{{ connected ? '已连接' : '未连接' }}</span>
        <span class="divider">|</span>
        <span>在线观众: {{ audienceCount }}</span>
        <span class="divider">|</span>
        <span>后端: 本机</span>
      </div>
    </header>

    <section class="phase-control">
      <h2>当前阶段</h2>
      <div class="current-state">
        <span class="phase-badge">{{ phaseLabels[currentPhase] }}</span>
        <span class="page-num">第 {{ currentPage + 1 }} 页</span>
      </div>

      <div class="phase-buttons">
        <button v-for="(label, key) in phaseLabels" :key="key"
          class="phase-btn" :class="{ active: currentPhase === key }"
          @click="switchPhase(key)">
          {{ label }}
        </button>
      </div>
    </section>

    <section class="page-control">
      <h2>页面控制</h2>
      <div class="page-nav">
        <button class="nav-btn" @click="prevPage" :disabled="currentPage <= 0">← 上一页</button>
        <span class="page-indicator">{{ currentPage + 1 }} / {{ maxPages[currentPhase] || '?' }}</span>
        <button class="nav-btn" @click="nextPageCmd">下一页 →</button>
      </div>
    </section>

    <section class="stats-section">
      <h2>观众统计</h2>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">{{ stats.totalSubmissions }}</div>
          <div class="stat-label">总提交数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats.currentRoundSubmissions }}</div>
          <div class="stat-label">本轮提交</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ audienceCount }}</div>
          <div class="stat-label">在线人数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats.completionRate }}%</div>
          <div class="stat-label">完成率</div>
        </div>
      </div>
    </section>

    <section class="answers-section">
      <h2>观众回答</h2>
      <div class="answer-tabs">
        <button v-for="(label, idx) in ['交互1', '交互2', '交互3', '交互4']" :key="idx"
          class="tab-btn" :class="{ active: activeTab === idx }"
          @click="activeTab = idx">{{ label }}</button>
      </div>
      <div class="answer-list">
        <div v-if="currentAnswers.length === 0" class="empty-state">暂无数据</div>
        <div v-for="(answer, i) in currentAnswers" :key="i" class="answer-item">
          <span class="answer-room">{{ answer.room }}号</span>
          <span class="answer-text">{{ answer.text }}</span>
        </div>
      </div>
    </section>

    <section class="quick-actions">
      <h2>快捷操作</h2>
      <div class="action-buttons">
        <button class="action-btn" @click="triggerLLM">触发LLM生成</button>
        <button class="action-btn danger" @click="resetAll">重置所有</button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  backendStatus,
  getAdminPin,
  connectBackend,
  onBackendEvent,
  resetShow,
  setAdminPin,
  setShowState,
  triggerLlm,
} from '../services/backend.js'

const connected = computed(() => backendStatus.connected)
const audienceCount = ref(0)
const currentPhase = ref('entry')
const currentPage = ref(0)
const activeTab = ref(0)
const answers = ref([[], [], [], []])
const pinInput = ref(getAdminPin())
const openAdmin = import.meta.env.VITE_OPEN_ADMIN === '1'
const adminUnlocked = ref(openAdmin || Boolean(getAdminPin()))
const authError = ref('')

const phaseLabels = {
  entry: '进场',
  prologue: '序章',
  act1: '交互1',
  act2: '交互2',
  act3: '交互3',
  act4: '交互4',
}

const maxPages = {
  entry: 2,
  prologue: 10,
  act1: 14,
  act2: 9,
  act3: 9,
  act4: 7,
}

const stats = ref({
  totalSubmissions: 0,
  currentRoundSubmissions: 0,
  completionRate: 0,
})

const currentAnswers = computed(() => answers.value[activeTab.value] || [])

let removeStateListener = null
let removeStatsListener = null
let removeErrorListener = null

function switchPhase(phase) {
  setShowState(phase, 0)
}

function prevPage() {
  if (currentPage.value > 0) {
    setShowState(currentPhase.value, currentPage.value - 1)
  }
}

function nextPageCmd() {
  setShowState(currentPhase.value, currentPage.value + 1)
}

function triggerLLM() {
  triggerLlm()
}

function resetAll() {
  if (!confirm('确定要重置所有观众状态？')) return
  resetShow()
}

function unlockAdmin() {
  const pin = pinInput.value.trim()
  if (!pin) {
    authError.value = '请输入后台口令'
    return
  }
  setAdminPin(pin)
  adminUnlocked.value = true
  authError.value = ''
  connectBackend('admin')
}

onMounted(() => {
  if (adminUnlocked.value) connectBackend('admin')

  removeStateListener = onBackendEvent('state', state => {
    currentPhase.value = state.phase || 'entry'
    currentPage.value = Number(state.page || 0)
  })

  removeStatsListener = onBackendEvent('stats', data => {
    audienceCount.value = data.audienceCount || 0
    stats.value.totalSubmissions = data.totalSubmissions || 0
    stats.value.currentRoundSubmissions = data.currentRoundSubmissions || 0
    stats.value.completionRate = data.completionRate || 0
    if (data.answers) answers.value = data.answers
  })

  removeErrorListener = onBackendEvent('error', data => {
    if (data?.code === 'unauthorized') {
      authError.value = '后台口令无效'
      adminUnlocked.value = false
    }
  })
})

onUnmounted(() => {
  if (removeStateListener) removeStateListener()
  if (removeStatsListener) removeStatsListener()
  if (removeErrorListener) removeErrorListener()
})
</script>

<style scoped>
.admin-login {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: #0f0f14;
  color: #e8e0d4;
  font-family: "GenRyuMinTW", "Noto Serif CJK SC", "Noto Serif SC", "Source Han Serif SC", "Songti SC", "SimSun", serif;
}

.admin-login-card {
  width: min(100%, 360px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 24px;
  border: 1px solid rgba(201, 169, 110, 0.18);
  border-radius: 10px;
  background: rgba(232, 224, 212, 0.035);
}

.admin-login-card h1 {
  font-size: 20px;
  font-weight: 500;
  color: #c9a96e;
}

.admin-login-card p {
  font-size: 13px;
  color: rgba(232, 224, 212, 0.62);
}

.admin-login-card input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid rgba(232, 224, 212, 0.16);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.26);
  color: #e8e0d4;
  font-family: inherit;
  outline: none;
}

.admin-login-card button {
  padding: 12px;
  border: 1px solid rgba(201, 169, 110, 0.32);
  border-radius: 8px;
  background: rgba(201, 169, 110, 0.1);
  color: #c9a96e;
  font-family: inherit;
  cursor: pointer;
}

.auth-error {
  font-size: 12px;
  color: #d87575;
}

.admin-panel {
  min-height: 100vh;
  background: #0f0f14;
  color: #e8e0d4;
  padding: 20px;
  font-family: "GenRyuMinTW", "Noto Serif CJK SC", "Noto Serif SC", "Source Han Serif SC", "Songti SC", "SimSun", serif;
  font-weight: 300;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.admin-header {
  margin-bottom: 24px;
}

.admin-header h1 {
  font-size: 20px;
  font-weight: 500;
  color: #c9a96e;
  letter-spacing: 2px;
  margin-bottom: 8px;
}

.status-bar {
  font-size: 13px;
  color: rgba(232, 224, 212, 0.6);
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #555;
}

.status-dot.active {
  background: #4caf50;
  box-shadow: 0 0 6px rgba(76, 175, 80, 0.5);
}

.divider {
  color: rgba(232, 224, 212, 0.2);
}

section {
  margin-bottom: 28px;
}

h2 {
  font-size: 14px;
  font-weight: 400;
  color: rgba(201, 169, 110, 0.6);
  letter-spacing: 2px;
  margin-bottom: 12px;
  text-transform: uppercase;
}

.current-state {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.phase-badge {
  background: rgba(201, 169, 110, 0.12);
  border: 1px solid rgba(201, 169, 110, 0.3);
  color: #c9a96e;
  padding: 4px 14px;
  border-radius: 16px;
  font-size: 13px;
  letter-spacing: 1px;
}

.page-num {
  font-size: 13px;
  color: rgba(232, 224, 212, 0.5);
}

.phase-buttons {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.phase-btn {
  background: rgba(232, 224, 212, 0.03);
  border: 1px solid rgba(232, 224, 212, 0.1);
  color: rgba(232, 224, 212, 0.7);
  padding: 10px 8px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.2s;
}

.phase-btn.active {
  background: rgba(201, 169, 110, 0.1);
  border-color: rgba(201, 169, 110, 0.4);
  color: #c9a96e;
}

.phase-btn:active {
  transform: scale(0.96);
}

.page-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.nav-btn {
  background: rgba(232, 224, 212, 0.04);
  border: 1px solid rgba(232, 224, 212, 0.12);
  color: #e8e0d4;
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.2s;
}

.nav-btn:disabled {
  opacity: 0.3;
  pointer-events: none;
}

.nav-btn:active {
  background: rgba(201, 169, 110, 0.1);
}

.page-indicator {
  font-size: 14px;
  color: rgba(232, 224, 212, 0.5);
  letter-spacing: 1px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.stat-card {
  background: rgba(232, 224, 212, 0.03);
  border: 1px solid rgba(232, 224, 212, 0.08);
  border-radius: 10px;
  padding: 14px;
  text-align: center;
}

.stat-value {
  font-size: 22px;
  font-weight: 500;
  color: #c9a96e;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 11px;
  color: rgba(232, 224, 212, 0.4);
  letter-spacing: 1px;
}

.answer-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}

.tab-btn {
  background: transparent;
  border: 1px solid rgba(232, 224, 212, 0.1);
  color: rgba(232, 224, 212, 0.5);
  padding: 6px 14px;
  border-radius: 16px;
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
}

.tab-btn.active {
  background: rgba(201, 169, 110, 0.1);
  border-color: rgba(201, 169, 110, 0.3);
  color: #c9a96e;
}

.answer-list {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid rgba(232, 224, 212, 0.06);
  border-radius: 8px;
  padding: 8px;
}

.empty-state {
  text-align: center;
  color: rgba(232, 224, 212, 0.25);
  font-size: 13px;
  padding: 20px;
}

.answer-item {
  display: flex;
  gap: 10px;
  padding: 6px 8px;
  border-bottom: 1px solid rgba(232, 224, 212, 0.04);
  font-size: 13px;
}

.answer-room {
  color: rgba(201, 169, 110, 0.6);
  white-space: nowrap;
  min-width: 50px;
}

.answer-text {
  color: rgba(232, 224, 212, 0.7);
}

.action-buttons {
  display: flex;
  gap: 10px;
}

.action-btn {
  flex: 1;
  background: rgba(201, 169, 110, 0.06);
  border: 1px solid rgba(201, 169, 110, 0.2);
  color: #c9a96e;
  padding: 12px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  letter-spacing: 1px;
  transition: all 0.2s;
}

.action-btn:active {
  background: rgba(201, 169, 110, 0.12);
}

.action-btn.danger {
  border-color: rgba(200, 60, 60, 0.3);
  color: #c85050;
  background: rgba(200, 60, 60, 0.04);
}

.action-btn.danger:active {
  background: rgba(200, 60, 60, 0.1);
}
</style>
