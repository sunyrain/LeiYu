<template>
  <div class="talk-page">
    <header class="talk-header">
      <div class="talk-title">
        <p class="talk-kicker">Bot 交互</p>
        <h1>繁漪聊天</h1>
        <p class="talk-subtitle">和 Deepseek 扮演的繁漪聊天</p>
      </div>
      <div class="talk-actions">
        <button type="button" class="ghost-btn" :disabled="sending" @click="resetChat">清空</button>
      </div>
    </header>

    <main ref="scrollerRef" class="talk-transcript" aria-live="polite" aria-relevant="additions text">
      <article
        v-for="message in messages"
        :key="message.id"
        class="talk-row"
        :class="message.role"
      >
        <div class="talk-meta">{{ message.role === 'assistant' ? '繁漪' : '你' }}</div>
        <div class="talk-bubble" :class="{ pending: message.pending }">
          <span v-if="message.pending" class="typing" aria-label="正在回复">
            <i></i><i></i><i></i>
          </span>
          <span v-else class="message-text">{{ message.content }}</span>
        </div>
      </article>
    </main>

    <footer class="talk-composer">
      <textarea
        ref="inputRef"
        v-model="draft"
        class="talk-input"
        rows="3"
        placeholder="输入内容，Enter 发送，Shift+Enter 换行"
        :disabled="sending"
        @keydown.enter.exact.prevent="sendMessage"
      ></textarea>
      <button type="button" class="send-btn" :disabled="sending || !draft.trim()" @click="sendMessage">
        {{ sending ? '发送中' : '发送' }}
      </button>
    </footer>
  </div>
</template>

<script setup>
import { nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { sendTalkChat } from '../services/talk.js'

const STORAGE_KEY = 'fy_talk_history_v1'
const DEFAULT_GREETING = '我在。别绕，直接说。'

const scrollerRef = ref(null)
const inputRef = ref(null)
const draft = ref('')
const sending = ref(false)
const messages = ref(loadMessages())

if (!messages.value.length) {
  messages.value.push(createMessage('assistant', DEFAULT_GREETING))
}

watch(
  messages,
  async () => {
    persistMessages()
    await nextTick()
    scrollToBottom()
  },
  { deep: true },
)

onMounted(() => {
  document.title = '繁漪聊天'
  scrollToBottom(false)
  nextTick(() => inputRef.value?.focus())
})

onBeforeUnmount(() => {
  persistMessages()
})

async function sendMessage() {
  const content = draft.value.trim()
  if (!content || sending.value) return

  const userMessage = createMessage('user', content)
  const pendingMessage = createMessage('assistant', '…', { pending: true })
  messages.value.push(userMessage, pendingMessage)
  draft.value = ''
  sending.value = true

  try {
    const payloadMessages = messages.value
      .filter(message => !message.pending)
      .map(message => ({ role: message.role, content: message.content }))
      .slice(-16)

    const result = await sendTalkChat(payloadMessages)
    replacePendingMessage(result.reply || DEFAULT_GREETING)
  } catch {
    replacePendingMessage('我这里刚刚断了一下。你再说一次。')
  } finally {
    sending.value = false
    await nextTick()
    scrollToBottom()
    inputRef.value?.focus()
  }
}

function resetChat() {
  if (sending.value) return
  messages.value = [createMessage('assistant', DEFAULT_GREETING)]
  draft.value = ''
  persistMessages()
  nextTick(() => inputRef.value?.focus())
}

function replacePendingMessage(content) {
  const index = [...messages.value].reverse().findIndex(message => message.pending)
  if (index === -1) {
    messages.value.push(createMessage('assistant', content))
    return
  }

  const realIndex = messages.value.length - 1 - index
  messages.value.splice(realIndex, 1, createMessage('assistant', content))
}

function scrollToBottom(behavior = true) {
  const el = scrollerRef.value
  if (!el) return
  const top = el.scrollHeight
  el.scrollTo({ top, behavior: behavior ? 'smooth' : 'auto' })
}

function createMessage(role, content, extra = {}) {
  return {
    id: `${role}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    ...extra,
  }
}

function loadMessages() {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    if (!Array.isArray(raw)) return []
    return raw
      .filter(message => message && (message.role === 'user' || message.role === 'assistant') && !message.pending)
      .map(message => ({
        id: message.id || `${message.role}_${Math.random().toString(36).slice(2, 8)}`,
        role: message.role,
        content: String(message.content || '').trim(),
      }))
      .filter(message => message.content)
      .slice(-40)
  } catch {
    return []
  }
}

function persistMessages() {
  if (typeof localStorage === 'undefined') return
  const snapshot = messages.value
    .filter(message => message && (message.role === 'user' || message.role === 'assistant'))
    .map(message => ({
      id: message.id,
      role: message.role,
      content: message.content,
      pending: Boolean(message.pending),
    }))
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
}
</script>

<style scoped>
.talk-page {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding:
    calc(18px + env(safe-area-inset-top))
    20px
    calc(16px + env(safe-area-inset-bottom));
  color: #ece5d7;
  background:
    linear-gradient(180deg, rgba(7, 8, 12, 0.92), rgba(7, 8, 12, 0.86)),
    radial-gradient(circle at top left, rgba(166, 110, 58, 0.16), transparent 34%),
    radial-gradient(circle at bottom right, rgba(66, 96, 130, 0.12), transparent 28%);
  user-select: text;
  -webkit-user-select: text;
}

.talk-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 14px;
  flex: 0 0 auto;
  width: min(100%, 920px);
  padding: 4px 2px 16px;
  border-bottom: 1px solid rgba(214, 175, 107, 0.16);
}

.talk-kicker {
  margin-bottom: 4px;
  color: rgba(214, 175, 107, 0.58);
  font-size: 11px;
  letter-spacing: 2px;
}

.talk-title h1 {
  font-size: 22px;
  font-weight: 300;
  letter-spacing: 0;
  color: #f4ecde;
  line-height: 1.2;
}

.talk-subtitle {
  margin-top: 4px;
  color: rgba(236, 229, 215, 0.44);
  font-size: 12px;
  line-height: 1.4;
}

.talk-actions {
  display: flex;
  gap: 10px;
}

.ghost-btn,
.send-btn {
  appearance: none;
  border: 1px solid rgba(214, 175, 107, 0.22);
  background: rgba(255, 255, 255, 0.03);
  color: #efe6d4;
  font: inherit;
  letter-spacing: 0;
  border-radius: 10px;
  padding: 10px 14px;
  min-height: 42px;
}

.ghost-btn:disabled,
.send-btn:disabled {
  opacity: 0.45;
}

.talk-transcript {
  flex: 1 1 auto;
  width: min(100%, 920px);
  overflow-y: auto;
  padding: 18px 4px 12px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  scroll-behavior: smooth;
}

.talk-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: min(78%, 740px);
}

.talk-row.user {
  align-self: flex-end;
  align-items: flex-end;
}

.talk-row.assistant {
  align-self: flex-start;
  align-items: flex-start;
}

.talk-meta {
  font-size: 12px;
  color: rgba(214, 175, 107, 0.76);
  letter-spacing: 0;
}

.talk-bubble {
  border: 1px solid rgba(232, 224, 212, 0.12);
  border-radius: 14px;
  padding: 13px 15px;
  background: rgba(255, 255, 255, 0.035);
  box-shadow: 0 10px 36px rgba(0, 0, 0, 0.16);
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
  -webkit-user-select: text;
}

.talk-row.assistant .talk-bubble {
  color: #f3ecde;
  background: rgba(255, 255, 255, 0.045);
}

.talk-row.user .talk-bubble {
  color: #f6f2ea;
  background: rgba(166, 110, 58, 0.12);
  border-color: rgba(214, 175, 107, 0.18);
}

.talk-bubble.pending {
  min-width: 72px;
}

.typing {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 22px;
}

.typing i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(243, 236, 222, 0.82);
  animation: typingPulse 1s infinite ease-in-out;
}

.typing i:nth-child(2) {
  animation-delay: 0.18s;
}

.typing i:nth-child(3) {
  animation-delay: 0.36s;
}

.talk-composer {
  flex: 0 0 auto;
  width: min(100%, 920px);
  display: flex;
  gap: 12px;
  align-items: stretch;
  padding-top: 12px;
  border-top: 1px solid rgba(214, 175, 107, 0.16);
}

.talk-input {
  flex: 1 1 auto;
  min-height: 96px;
  max-height: 180px;
  resize: none;
  border-radius: 12px;
  border: 1px solid rgba(214, 175, 107, 0.18);
  background: rgba(255, 255, 255, 0.04);
  color: #f2eadb;
  padding: 13px 15px;
  font: inherit;
  line-height: 1.7;
  letter-spacing: 0;
  outline: none;
  user-select: text;
  -webkit-user-select: text;
}

.talk-input::placeholder {
  color: rgba(236, 229, 215, 0.42);
}

@keyframes typingPulse {
  0%, 80%, 100% {
    opacity: 0.35;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-2px);
  }
}

@media (max-width: 720px) {
  .talk-page {
    padding-left: 12px;
    padding-right: 12px;
  }

  .talk-header {
    padding-bottom: 12px;
  }

  .talk-transcript {
    padding-top: 14px;
  }

  .talk-row {
    max-width: 92%;
  }

  .talk-composer {
    flex-direction: column;
  }

  .send-btn {
    width: 100%;
  }
}
</style>
