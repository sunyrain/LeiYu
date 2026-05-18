<template>
  <div class="page front-page">
    <template v-if="gameState.currentPage === 0">
      <div class="cover-stage">
        <img
          class="cover-mark"
          src="/backgrounds/pages/entry-cover.jpg"
          alt="蘩漪2026封面"
          draggable="false"
        />
        <div class="cover-hint">轻触进入</div>
      </div>
    </template>

    <template v-else-if="gameState.currentPage === 1">
      <div class="front-panel input-panel">
        <p>请输入您的门牌号：</p>
        <input
          type="text"
          v-model="roomInput"
          placeholder="输入门牌号"
          inputmode="numeric"
          @keyup.enter="submitRoom"
        />
        <button class="btn" :disabled="!roomInput.trim()" @click="submitRoom">确认</button>
      </div>
    </template>

    <template v-else-if="gameState.currentPage === 2">
      <div class="front-panel">
        <p>亲爱的<span class="highlight">{{ gameState.roomNumber }}</span>号住户，您好。</p>
        <p>您或许想知道刚刚这个女人的故事。</p>
      </div>
    </template>

    <template v-else-if="gameState.currentPage === 3">
      <div class="front-panel bio-panel">
        <p>她叫蘩漪。</p>
        <p>她被困在一间过于安静的房子里，也被困在一些无法说出口的关系里。</p>
        <p>她敏感、锋利、清醒，像一场被压低声音的雷雨。</p>
        <p>今天，她会在这间房间里和你相遇。</p>
      </div>
    </template>

    <template v-else-if="gameState.currentPage === 4">
      <div class="embedded-chat">
        <header class="embedded-chat-head">
          <div class="embedded-chat-title">
            <span class="embedded-chat-kicker">BOT 交互</span>
            <h2>和蘩漪聊天</h2>
          </div>
          <div class="embedded-chat-status" :class="{ active: !chatSending }">
            {{ chatSending ? '发送中' : '在线' }}
          </div>
        </header>
        <div ref="chatScroller" class="embedded-chat-log" aria-live="polite">
          <article
            v-for="message in chatMessages"
            :key="message.id"
            class="embedded-chat-row"
            :class="message.role"
          >
            <div class="embedded-chat-name">{{ message.role === 'assistant' ? '蘩漪' : `${gameState.roomNumber || ''}号` }}</div>
            <div class="embedded-chat-bubble" :class="{ pending: message.pending }">
              <span v-if="message.pending" class="typing"><i></i><i></i><i></i></span>
              <span v-else>{{ message.content }}</span>
            </div>
          </article>
        </div>
        <form class="embedded-chat-form" @submit.prevent="submitChat">
          <textarea
            v-model="chatDraft"
            rows="3"
            placeholder="在这间房间里，你想要做什么？"
            :disabled="chatSending"
          ></textarea>
          <div class="chat-suggestions">
            <button
              v-for="word in suggestions"
              :key="word"
              type="button"
              @click="useSuggestion(word)"
            >
              {{ word }}
            </button>
          </div>
          <button class="btn chat-send" :disabled="chatSending || !chatDraft.trim()" type="submit">
            {{ chatSending ? '发送中' : '发送' }}
          </button>
        </form>
      </div>
    </template>
  </div>
</template>

<script setup>
import { nextTick, ref } from 'vue'
import { gameState, setAnswer } from '../../stores/game.js'
import { extractEntryProfile, sendTalkChat } from '../../services/talk.js'

const roomInput = ref(gameState.roomNumber || '')
const chatScroller = ref(null)
const chatDraft = ref('')
const chatSending = ref(false)
const chatMessages = ref(loadInitialChat())

const suggestions = [
  '在房间里跳舞',
  '和朋友一起唱歌',
  '睡一个好觉',
  '做白日梦',
  '煮一碗泡面',
]

function submitRoom() {
  const value = roomInput.value.trim()
  if (!value) return
  setAnswer('roomNumber', value)
  ensureGreeting()
  gameState.currentPage = 2
}

function ensureGreeting() {
  const greeting = buildGreeting()
  const first = chatMessages.value[0]
  if (first?.role === 'assistant') {
    first.content = greeting
    return
  }
  chatMessages.value.unshift(createMessage('assistant', greeting))
}

function loadInitialChat() {
  return [createMessage('assistant', buildGreeting())]
}

function buildGreeting() {
  return `${gameState.roomNumber || '2026'}号，你好。我是蘩漪。已经很久没人来过这间房子了，你为什么来？在这间房间里，你想要做什么？`
}

function useSuggestion(word) {
  chatDraft.value = word
}

async function submitChat() {
  const content = chatDraft.value.trim()
  if (!content || chatSending.value) return

  const userMessage = createMessage('user', content)
  const pendingMessage = createMessage('assistant', '...', { pending: true })
  chatMessages.value.push(userMessage, pendingMessage)
  const pendingPayload = buildChatPayload()
  persistEntryContext(pendingPayload)
  chatDraft.value = ''
  chatSending.value = true
  await nextTick()
  scrollChat()

  try {
    const payload = buildChatPayload()
    const result = await sendTalkChat(payload)
    replacePending(result.reply || '我听见了。继续说。')
    const nextPayload = buildChatPayload()
    persistEntryContext(nextPayload)
    updateEntryProfile(nextPayload)
  } catch {
    replacePending('我这里刚刚断了一下。你再说一次。')
    const nextPayload = buildChatPayload()
    persistEntryContext(nextPayload)
    updateEntryProfile(nextPayload)
  } finally {
    chatSending.value = false
    await nextTick()
    scrollChat()
  }
}

function replacePending(content) {
  const index = chatMessages.value.findIndex(message => message.pending)
  if (index >= 0) {
    chatMessages.value.splice(index, 1, createMessage('assistant', content))
  } else {
    chatMessages.value.push(createMessage('assistant', content))
  }
}

function buildChatPayload() {
  return chatMessages.value
    .filter(message => !message.pending)
    .map(message => ({ role: message.role, content: message.content }))
    .slice(-16)
}

function persistEntryContext(messages) {
  const cleanMessages = Array.isArray(messages) ? messages.filter(message => message?.content) : []
  const userText = cleanMessages
    .filter(message => message.role === 'user')
    .map(message => message.content)
    .join('\n')
    .trim()

  if (userText) {
    setAnswer('entryWish', userText, { label: compactForLabel(userText, 48), text: userText })
  }
  setAnswer('entryChatLog', JSON.stringify(cleanMessages.slice(-16)))
}

function compactForLabel(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

async function updateEntryProfile(messages) {
  try {
    const result = await extractEntryProfile(messages)
    const profile = normalizeEntryProfile(result.profile)
    if (!profile) return
    setAnswer('entryProfile', JSON.stringify(profile))
  } catch {
    // The profile only personalizes later copy; chat should keep working if extraction fails.
  }
}

function normalizeEntryProfile(profile) {
  if (!profile || typeof profile !== 'object') return null
  const normalized = {
    desire: compactProfileText(profile.desire, 14),
    mood: compactProfileText(profile.mood, 10),
    imagery: Array.isArray(profile.imagery)
      ? profile.imagery.map(item => compactProfileText(item, 8)).filter(Boolean).slice(0, 4)
      : [],
    tendency: compactProfileText(profile.tendency, 12),
    quote: compactProfileText(profile.quote, 24),
  }
  return Object.values(normalized).some(value => Array.isArray(value) ? value.length : value) ? normalized : null
}

function compactProfileText(value, maxLength) {
  return String(value || '')
    .replace(/["'“”‘’{}[\]]/g, '')
    .replace(/\s+/g, '')
    .trim()
    .slice(0, maxLength)
}

function scrollChat() {
  const el = chatScroller.value
  if (!el) return
  el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
}

function createMessage(role, content, extra = {}) {
  return {
    id: `${role}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    ...extra,
  }
}
</script>

<style scoped>
.cover-stage {
  width: min(100%, 560px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.cover-mark {
  display: block;
  width: min(86vw, 560px);
  max-height: min(78vh, 780px);
  object-fit: contain;
  border: 1px solid rgba(238, 204, 139, 0.14);
  box-shadow: 0 24px 58px rgba(0, 0, 0, 0.72);
  background: #000;
  user-select: none;
  -webkit-user-drag: none;
}

.cover-hint {
  color: rgba(242, 234, 219, 0.56);
  font-size: 12px;
  letter-spacing: 3px;
  text-indent: 3px;
}

.front-panel {
  width: min(100%, 460px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.bio-panel {
  justify-content: center;
}

.embedded-chat {
  width: min(100%, 480px);
  height: min(80vh, 760px);
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 4px;
  text-align: left;
}

.embedded-chat-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(238, 204, 139, 0.14);
}

.embedded-chat-title {
  min-width: 0;
}

.embedded-chat-kicker {
  display: block;
  margin-bottom: 4px;
  color: rgba(238, 204, 139, 0.54);
  font-size: 11px;
  letter-spacing: 2px;
}

.embedded-chat-title h2 {
  font-size: 18px;
  font-weight: 400;
  color: #f2eadb;
  line-height: 1.35;
}

.embedded-chat-status {
  flex: 0 0 auto;
  padding: 6px 10px;
  border: 1px solid rgba(238, 204, 139, 0.14);
  border-radius: 999px;
  color: rgba(242, 234, 219, 0.46);
  font-size: 11px;
  letter-spacing: 1px;
  background: rgba(8, 6, 6, 0.28);
}

.embedded-chat-status.active {
  color: rgba(246, 214, 152, 0.92);
  border-color: rgba(246, 214, 152, 0.28);
  background: rgba(221, 154, 73, 0.12);
}

.embedded-chat-log {
  flex: 1 1 auto;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 0 8px;
}

.embedded-chat-row {
  width: 88%;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.embedded-chat-row.user {
  align-self: flex-end;
  align-items: flex-end;
}

.embedded-chat-name {
  font-size: 12px;
  color: rgba(238, 204, 139, 0.72);
  letter-spacing: 1px;
}

.embedded-chat-bubble {
  width: fit-content;
  max-width: 100%;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(238, 204, 139, 0.14);
  background: rgba(8, 6, 6, 0.46);
  backdrop-filter: blur(10px);
  color: #f2eadb;
  font-size: 16px;
  line-height: 1.75;
  text-align: left;
  white-space: pre-wrap;
  word-break: break-word;
}

.embedded-chat-row.user .embedded-chat-bubble {
  background: rgba(191, 126, 60, 0.16);
  border-color: rgba(238, 204, 139, 0.22);
}

.embedded-chat-row.assistant .embedded-chat-bubble {
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
}

.embedded-chat-form {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.embedded-chat-form textarea {
  min-height: 96px;
  resize: none;
  border-radius: 12px;
  border: 1px solid rgba(238, 204, 139, 0.22);
  background: rgba(8, 6, 6, 0.5);
  color: #f2eadb;
  padding: 12px 14px;
  font: inherit;
  font-size: 16px;
  line-height: 1.6;
  outline: none;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.02);
}

.chat-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chat-suggestions button {
  border: 1px solid rgba(238, 204, 139, 0.18);
  border-radius: 10px;
  background: rgba(8, 6, 6, 0.34);
  color: rgba(242, 234, 219, 0.88);
  padding: 7px 11px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.chat-suggestions button:active {
  border-color: rgba(238, 204, 139, 0.42);
  background: rgba(191, 126, 60, 0.18);
}

.chat-send {
  align-self: flex-end;
  min-width: 108px;
}

.waiting-sub {
  color: rgba(242, 234, 219, 0.38);
  font-size: 12px;
  text-align: center;
  margin-top: -2px;
}

.typing {
  display: inline-flex;
  gap: 5px;
}

.typing i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: rgba(242, 234, 219, 0.86);
  animation: talkPulse 1s infinite ease-in-out;
}

.typing i:nth-child(2) {
  animation-delay: 0.16s;
}

.typing i:nth-child(3) {
  animation-delay: 0.32s;
}

@keyframes talkPulse {
  0%, 80%, 100% { opacity: 0.32; transform: translateY(0); }
  40% { opacity: 1; transform: translateY(-2px); }
}
</style>
