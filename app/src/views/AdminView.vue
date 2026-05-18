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

    <section class="show-control">
      <h2>演出控制</h2>
      <div class="current-state">
        <span class="phase-badge">{{ phaseLabels[currentPhase] }}</span>
        <span class="page-num">第 {{ currentPage + 1 }} 页</span>
      </div>

      <div class="control-group">
        <div class="control-group-title">阶段</div>
        <div class="phase-buttons">
          <button v-for="(label, key) in controllablePhaseLabels" :key="key"
            class="phase-btn" :class="{ active: currentPhase === key }"
            @click="switchPhase(key)">
            {{ label }}
          </button>
        </div>
      </div>

      <div class="control-group">
        <div class="control-group-title">总控节点</div>
        <div class="cue-buttons">
          <button
            v-for="cue in currentPhaseCues"
            :key="cue.code"
            class="cue-btn"
            :class="{ active: isCueActive(cue) }"
            @click="jumpToCue(cue)"
          >
            <span class="cue-code">{{ cue.code }}</span>
            <span class="cue-target">{{ phaseLabels[cue.phase] }} · 第 {{ cue.page + 1 }} 页</span>
          </button>
        </div>
        <div v-if="currentPhaseCues.length === 0" class="cue-empty">当前阶段没有总控节点</div>
      </div>
    </section>

    <section class="answers-section">
      <div class="section-title-row">
        <h2>观众回答</h2>
        <div class="answer-export-actions">
          <button class="export-btn" @click="downloadAnswers('csv')">导出 CSV</button>
          <button class="export-btn" @click="downloadAnswers('json')">导出 JSON</button>
        </div>
      </div>
      <div class="answer-tabs">
        <button v-for="tab in answerPhaseTabs" :key="tab.phase"
          class="tab-btn" :class="{ active: activeTab === tab.index }"
          @click="activeTab = tab.index">
          <span>{{ tab.label }}</span>
          <span class="tab-count">{{ phaseAnswerCounts[tab.index] || 0 }}</span>
        </button>
      </div>
      <div class="answer-groups">
        <div v-if="currentAnswerGroups.length === 0" class="empty-state">暂无数据</div>
        <article
          v-for="group in currentAnswerGroups"
          :key="group.key"
          class="answer-group"
          :class="{ expanded: expandedAnswerGroup === group.key }"
        >
          <button
            type="button"
            class="answer-group-head"
            :aria-expanded="expandedAnswerGroup === group.key"
            @click="toggleAnswerGroup(group.key)"
          >
            <span>
              <span class="answer-group-title-row">
                <span class="answer-group-title">{{ group.title }}</span>
                <span class="answer-rate-pill">{{ group.completionRate }}%</span>
              </span>
              <span class="answer-group-meta">
                {{ group.completionAnswered }}/{{ group.completionTotal }} 人 · {{ group.count }} 条 · 最新 {{ formatAnswerTime(group.latestTime) }}
              </span>
            </span>
            <span class="answer-group-toggle">{{ expandedAnswerGroup === group.key ? '收起' : '展开' }}</span>
          </button>
          <div class="completion-bar" aria-hidden="true">
            <span :style="{ width: `${group.completionRate}%` }"></span>
          </div>
          <div v-if="expandedAnswerGroup === group.key" class="answer-group-body">
            <div class="answer-summary">
              <span v-for="item in group.summary" :key="item.label" class="summary-chip">
                <span>{{ item.label }}</span>
                <strong>{{ item.count }}</strong>
              </span>
            </div>
            <div class="answer-preview">
              <span>最近</span>
              <p>{{ group.latestText }}</p>
            </div>
            <div class="answer-detail-list">
              <div v-for="answer in group.items" :key="answer.id || `${answer.sessionId}-${answer.questionId}-${answer.time}`" class="answer-item">
                <span class="answer-room">
                  <span>{{ answer.room }}号</span>
                  <span v-if="answer.sessionCode" class="answer-session">ID {{ answer.sessionCode }}</span>
                </span>
                <span class="answer-text">{{ answer.text }}</span>
                <span class="answer-time">{{ formatAnswerTime(answer.time) }}</span>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>

    <section class="quick-actions">
      <h2>快捷操作</h2>
      <div class="action-buttons">
        <button class="action-btn danger" @click="resetAll">重置所有</button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import {
  backendStatus,
  getAdminPin,
  connectBackend,
  onBackendEvent,
  resetShow,
  setAdminPin,
  setShowState,
} from '../services/backend.js'

const connected = computed(() => backendStatus.connected)
const audienceCount = ref(0)
const currentPhase = ref('entry')
const currentPage = ref(0)
const activeTab = ref(0)
const expandedAnswerGroup = ref('')
const answers = ref([[], [], [], []])
const pinInput = ref(getAdminPin())
const adminUnlocked = ref(Boolean(getAdminPin()))
const authError = ref('')

const phaseLabels = {
  entry: '进场',
  act1: '交互1',
  act2: '交互2',
  act3: '交互3',
}

const controllablePhaseLabels = {
  entry: phaseLabels.entry,
  act1: phaseLabels.act1,
  act2: phaseLabels.act2,
  act3: phaseLabels.act3,
}

const stats = ref({
  audienceTotal: 0,
  totalSubmissions: 0,
  currentRoundSubmissions: 0,
  completionRate: 0,
  questionCompletion: {},
})

const answerPhaseTabs = [
  { index: 0, phase: 'entry', label: '进场' },
  { index: 1, phase: 'act1', label: '交互1' },
  { index: 2, phase: 'act2', label: '交互2' },
  { index: 3, phase: 'act3', label: '交互3' },
]

const answerQuestionOrder = {
  entry: ['entryWish'],
  act1: ['lovedOneName'],
  act2: ['leaveChoice', 'departureAction', 'reunionAction'],
  act3: ['poemMaterials', 'roomBase'],
}

const answerQuestionLabels = {
  entryWish: '进场聊天意图',
  lovedOneName: '心中想起的人',
  leaveChoice: '我要离开Ta吗',
  departureAction: 'Ta 要走了，你想',
  reunionAction: '如果 Ta 重新出现',
  roomBase: '房间构成',
  poemMaterials: '扩展词库',
}

const currentAnswers = computed(() => answers.value[activeTab.value] || [])
const currentAnswerPhase = computed(() => answerPhaseTabs[activeTab.value] || answerPhaseTabs[0])
const phaseAnswerCounts = computed(() => answerPhaseTabs.map(tab => (answers.value[tab.index] || []).length))
const currentAnswerGroups = computed(() => groupAnswersByQuestion(currentAnswers.value, currentAnswerPhase.value.phase))

const showCues = [
  { code: '进场', phase: 'entry', page: 0 },
  { code: '交互1-1', phase: 'act1', page: 0 },
  { code: '交互1-2', phase: 'act1', page: 1 },
  { code: '交互1-3', phase: 'act1', page: 2 },
  { code: '交互2', phase: 'act2', page: 0 },
  { code: '交互3-1', phase: 'act3', page: 0 },
  { code: '交互3-2', phase: 'act3', page: 1 },
  { code: '交互3-3', phase: 'act3', page: 2 },
]

const currentPhaseCues = computed(() => showCues.filter(cue => cue.phase === currentPhase.value))

watch(currentAnswerGroups, groups => {
  if (!groups.length || !groups.some(group => group.key === expandedAnswerGroup.value)) {
    expandedAnswerGroup.value = ''
  }
}, { immediate: true })

let removeStateListener = null
let removeStatsListener = null
let removeErrorListener = null

function switchPhase(phase) {
  setShowState(phase, 0)
}

function jumpToCue(cue) {
  setShowState(cue.phase, cue.page)
}

function isCueActive(cue) {
  return currentPhase.value === cue.phase && currentPage.value === cue.page
}

function groupAnswersByQuestion(list, phase) {
  const groups = new Map()
  const order = answerQuestionOrder[phase] || []

  order.forEach(questionId => {
    groups.set(questionId, {
      key: `${phase}-${questionId}`,
      questionId,
      title: answerQuestionLabels[questionId] || questionId,
      items: [],
    })
  })

  list.forEach(answer => {
    const questionId = answer.questionId || 'unknown'
    if (!groups.has(questionId)) {
      groups.set(questionId, {
        key: `${phase}-${questionId}`,
        questionId,
        title: answerQuestionLabels[questionId] || questionId || '未分类',
        items: [],
      })
    }
    groups.get(questionId).items.push(answer)
  })

  return [...groups.values()]
    .map(group => {
      const items = [...group.items].sort((a, b) => Number(b.time || 0) - Number(a.time || 0))
      const users = new Set(items.map(item => item.sessionId || `${item.room}-${item.sessionCode}`).filter(Boolean))
      const latest = items[0] || {}
      const completion = getQuestionCompletion(group.questionId)
      return {
        ...group,
        items,
        count: items.length,
        uniqueUsers: completion.answered || users.size || items.length,
        completionRate: completion.rate,
        completionAnswered: completion.answered,
        completionTotal: completion.total,
        latestTime: Number(latest.time || 0),
        latestText: compactText(latest.text || latest.label || latest.value || '暂无内容', 76),
        summary: buildAnswerSummary(items),
      }
    })
    .sort((a, b) => {
      const aIndex = order.indexOf(a.questionId)
      const bIndex = order.indexOf(b.questionId)
      if (aIndex !== -1 || bIndex !== -1) {
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex)
      }
      return b.latestTime - a.latestTime
    })
}

function getQuestionCompletion(questionId) {
  return stats.value.questionCompletion?.[questionId] || {
    answered: 0,
    total: stats.value.audienceTotal || audienceCount.value || 0,
    rate: 0,
  }
}

function buildAnswerSummary(items) {
  const counts = new Map()
  items.forEach(answer => {
    const label = compactText(answer.label || answer.value || answer.text || '未填写', 28)
    counts.set(label, (counts.get(label) || 0) + 1)
  })

  const summary = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-CN'))

  if (!summary.length) return [{ label: '暂无内容', count: 0 }]
  if (summary.length > 6 && summary.every(item => item.count === 1)) {
    return [{ label: `${summary.length} 条不同回答`, count: items.length }]
  }
  return summary.slice(0, 6)
}

function compactText(value, maxLength = 48) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1)}…`
}

function formatAnswerTime(time) {
  if (!time) return '--:--'
  return new Date(time).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function toggleAnswerGroup(key) {
  expandedAnswerGroup.value = expandedAnswerGroup.value === key ? '' : key
}

function downloadAnswers(format) {
  const safeFormat = format === 'json' ? 'json' : 'csv'
  const url = new URL(`/api/export/answers.${safeFormat}`, window.location.origin)
  const pin = getAdminPin()
  if (pin) url.searchParams.set('pin', pin)
  window.open(url.toString(), '_blank', 'noopener')
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
  if (adminUnlocked.value) {
    connectBackend('admin')
  }

  removeStateListener = onBackendEvent('state', state => {
    currentPhase.value = state.phase || 'entry'
    currentPage.value = Number(state.page || 0)
  })

  removeStatsListener = onBackendEvent('stats', data => {
    audienceCount.value = data.audienceCount || 0
    stats.value.audienceTotal = data.audienceTotal || data.audienceCount || 0
    stats.value.totalSubmissions = data.totalSubmissions || 0
    stats.value.currentRoundSubmissions = data.currentRoundSubmissions || 0
    stats.value.completionRate = data.completionRate || 0
    stats.value.questionCompletion = data.questionCompletion || {}
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
  height: 100%;
  min-height: 100%;
  overflow-y: auto;
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

.admin-error {
  font-size: 12px;
  color: #d87575;
  margin-bottom: 10px;
}

.admin-panel {
  height: 100%;
  max-height: 100vh;
  background: #0f0f14;
  color: #e8e0d4;
  padding: 20px;
  padding-bottom: calc(72px + env(safe-area-inset-bottom));
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

.control-group + .control-group {
  margin-top: 14px;
}

.control-group-title {
  margin-bottom: 8px;
  color: rgba(232, 224, 212, 0.42);
  font-size: 12px;
  letter-spacing: 1px;
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

.cue-buttons {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.cue-btn {
  min-height: 58px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  gap: 6px;
  padding: 10px 8px;
  border: 1px solid rgba(201, 169, 110, 0.18);
  border-radius: 8px;
  background: rgba(201, 169, 110, 0.055);
  color: rgba(232, 224, 212, 0.76);
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s;
}

.cue-btn.active {
  border-color: rgba(201, 169, 110, 0.56);
  background: rgba(201, 169, 110, 0.14);
  color: #f0c979;
}

.cue-btn:active {
  transform: scale(0.97);
}

.cue-empty {
  padding: 14px 12px;
  border: 1px solid rgba(232, 224, 212, 0.08);
  border-radius: 8px;
  color: rgba(232, 224, 212, 0.34);
  font-size: 12px;
  text-align: left;
}

.cue-code {
  color: #c9a96e;
  font-size: 15px;
  line-height: 1;
  letter-spacing: 1px;
}

.cue-target {
  color: rgba(232, 224, 212, 0.42);
  font-size: 11px;
  line-height: 1.2;
}

.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.section-title-row h2 {
  margin-bottom: 0;
}

.answer-export-actions {
  display: flex;
  gap: 8px;
}

.export-btn {
  min-height: 30px;
  padding: 6px 10px;
  border: 1px solid rgba(201, 169, 110, 0.18);
  border-radius: 8px;
  background: rgba(201, 169, 110, 0.055);
  color: rgba(232, 224, 212, 0.68);
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}

.export-btn:active {
  border-color: rgba(201, 169, 110, 0.42);
  color: #c9a96e;
}

.answer-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
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

.tab-count {
  min-width: 22px;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(232, 224, 212, 0.06);
  color: rgba(232, 224, 212, 0.48);
  font-size: 10px;
  line-height: 1.2;
}

.tab-btn.active .tab-count {
  background: rgba(201, 169, 110, 0.16);
  color: rgba(240, 201, 121, 0.86);
}

.answer-groups {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.empty-state {
  text-align: center;
  color: rgba(232, 224, 212, 0.25);
  font-size: 13px;
  padding: 20px;
}

.answer-group {
  border: 1px solid rgba(232, 224, 212, 0.08);
  border-radius: 8px;
  background: rgba(232, 224, 212, 0.025);
  overflow: hidden;
}

.answer-group.expanded {
  border-color: rgba(201, 169, 110, 0.22);
  background: rgba(201, 169, 110, 0.035);
}

.answer-group-head {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  min-height: 52px;
  padding: 10px 14px;
  border: 0;
  background: transparent;
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.answer-group-head > span:first-child {
  min-width: 0;
}

.answer-group-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.answer-group-title {
  display: block;
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(232, 224, 212, 0.88);
  font-size: 16px;
  line-height: 1.3;
}

.answer-rate-pill {
  flex: 0 0 auto;
  min-width: 42px;
  padding: 2px 7px;
  border: 1px solid rgba(201, 169, 110, 0.16);
  border-radius: 999px;
  background: rgba(201, 169, 110, 0.07);
  color: rgba(240, 201, 121, 0.82);
  font-size: 11px;
  line-height: 1.2;
  text-align: center;
}

.answer-group-meta {
  display: block;
  margin-top: 5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(232, 224, 212, 0.36);
  font-size: 12px;
  line-height: 1.3;
}

.answer-group-toggle {
  flex: 0 0 auto;
  min-width: 34px;
  color: rgba(201, 169, 110, 0.7);
  font-size: 12px;
  text-align: right;
}

.completion-bar {
  height: 2px;
  margin: 0;
  overflow: hidden;
  background: rgba(232, 224, 212, 0.06);
}

.completion-bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, rgba(201, 169, 110, 0.52), rgba(240, 201, 121, 0.9));
  transition: width 0.24s ease;
}

.answer-group-body {
  padding: 10px 12px 12px;
  border-top: 1px solid rgba(232, 224, 212, 0.06);
  background: rgba(0, 0, 0, 0.1);
}

.answer-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.summary-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 5px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.18);
  border: 1px solid rgba(232, 224, 212, 0.06);
  color: rgba(232, 224, 212, 0.66);
  font-size: 11px;
  line-height: 1.2;
}

.summary-chip span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-chip strong {
  color: #c9a96e;
  font-weight: 500;
}

.answer-preview {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 8px;
  padding-bottom: 10px;
  color: rgba(232, 224, 212, 0.52);
  font-size: 12px;
}

.answer-preview span {
  color: rgba(201, 169, 110, 0.56);
}

.answer-preview p {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.answer-detail-list {
  max-height: 260px;
  overflow-y: auto;
  margin: 0 -12px -12px;
  border-top: 1px solid rgba(232, 224, 212, 0.06);
  background: rgba(0, 0, 0, 0.12);
}

.answer-item {
  display: grid;
  grid-template-columns: minmax(72px, 0.3fr) minmax(0, 1fr) auto;
  align-items: start;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(232, 224, 212, 0.04);
  font-size: 13px;
}

.answer-item:last-child {
  border-bottom: 0;
}

.answer-room {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: rgba(201, 169, 110, 0.6);
  white-space: nowrap;
  min-width: 72px;
}

.answer-session {
  color: rgba(232, 224, 212, 0.28);
  font-size: 10px;
  letter-spacing: 0.5px;
}

.answer-text {
  color: rgba(232, 224, 212, 0.7);
  overflow-wrap: anywhere;
}

.answer-time {
  color: rgba(232, 224, 212, 0.28);
  font-size: 11px;
  white-space: nowrap;
}

.action-buttons {
  display: flex;
  gap: 10px;
}

.monologue-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 12px;
}

.monologue-action-main,
.monologue-action-rate {
  display: block;
}

.monologue-action-rate {
  margin-top: 5px;
  color: rgba(232, 224, 212, 0.42);
  font-size: 11px;
  letter-spacing: 0;
}

.monologue-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.monologue-card {
  min-height: 160px;
  padding: 12px;
  border: 1px solid rgba(232, 224, 212, 0.08);
  border-radius: 8px;
  background: rgba(232, 224, 212, 0.03);
}

.monologue-title {
  margin-bottom: 8px;
  color: rgba(201, 169, 110, 0.74);
  font-size: 12px;
}

.monologue-readiness {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  color: rgba(232, 224, 212, 0.42);
  font-size: 11px;
  line-height: 1.35;
}

.monologue-question-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.monologue-question-chip {
  max-width: 100%;
  padding: 4px 7px;
  border: 1px solid rgba(232, 224, 212, 0.06);
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.16);
  color: rgba(232, 224, 212, 0.5);
  font-size: 10px;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.monologue-card p {
  white-space: pre-wrap;
  color: rgba(232, 224, 212, 0.76);
  font-size: 13px;
  line-height: 1.75;
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

.action-btn:disabled {
  opacity: 0.45;
  pointer-events: none;
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

@media (max-width: 760px) {
  .status-bar,
  .current-state,
  .section-title-row {
    flex-wrap: wrap;
  }

  .answer-export-actions {
    width: 100%;
  }

  .export-btn {
    flex: 1;
  }

  .answer-item {
    grid-template-columns: 72px minmax(0, 1fr);
  }

  .answer-time {
    grid-column: 2;
  }

  .phase-buttons,
  .cue-buttons,
  .monologue-actions,
  .monologue-grid {
    grid-template-columns: 1fr;
  }

  .action-buttons {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
