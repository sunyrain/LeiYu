<template>
  <div class="page front-page">
    <template v-if="gameState.currentPage === 0">
      <div class="front-panel poem-panel">
        <header class="poem-header">
          <div>
            <span class="poem-kicker">拼贴诗</span>
            <h1>把词放进房间里</h1>
          </div>
          <div class="bank-tabs" aria-label="词库类型">
            <button
              type="button"
              :class="{ active: activeBank === 'base' }"
              @click="setBank('base')"
            >
              基础词库
            </button>
            <button
              type="button"
              :class="{ active: activeBank === 'extension' }"
              @click="setBank('extension')"
            >
              扩展词库
            </button>
          </div>
        </header>

        <div class="poem-lines">
          <section
            v-for="(slot, index) in poemSlots"
            :key="slot.key"
            class="poem-line-wrap"
          >
            <div
              class="poem-line"
              :class="{ active: activeSlot === index }"
              @click="setActiveSlot(index)"
            >
              <span class="poem-prefix">{{ slot.prefix }}</span>
              <div class="poem-slot">
                <button
                  v-for="(word, wordIndex) in selectedWords[index]"
                  :key="`${slot.key}-${word}-${wordIndex}`"
                  type="button"
                  class="poem-token"
                  :class="{ selected: activeSlot === index && selectedTokenIndex === wordIndex }"
                  @click.stop="selectToken(index, wordIndex)"
                >
                  {{ word }}
                </button>
                <span v-if="!selectedWords[index]?.length" class="poem-placeholder">点击词库添加词语</span>
              </div>
              <span class="poem-suffix">{{ slot.suffix }}</span>
            </div>

            <div v-if="activeSlot === index" class="poem-line-tools">
              <button type="button" class="mini-btn" :disabled="!canMoveSelected(-1)" @click="moveSelectedWord(-1)">前移</button>
              <button type="button" class="mini-btn" :disabled="!canMoveSelected(1)" @click="moveSelectedWord(1)">后移</button>
              <button type="button" class="mini-btn" :disabled="selectedTokenIndex < 0" @click="removeSelectedWord">删除</button>
              <button type="button" class="mini-btn subtle" :disabled="!selectedWords[index]?.length" @click="clearSlot(index)">清空本行</button>
            </div>
          </section>
        </div>

        <section class="word-bank-shell">
          <div class="word-bank-head">
            <span>{{ activeBankLabel }}</span>
            <button
              v-if="activeBank === 'extension'"
              type="button"
              class="refresh-btn"
              :disabled="loadingBlocks"
              @click="refreshExtensionBlocks"
            >
              {{ loadingBlocks ? '刷新中' : '刷新扩展' }}
            </button>
          </div>

          <div class="word-bank">
            <button
              v-for="word in activeWords"
              :key="word"
              type="button"
              class="word-chip"
              :class="{ selected: isWordSelected(word) }"
              @click="toggleWord(word)"
            >
              {{ word }}
            </button>
          </div>
        </section>

        <p class="poem-help">点击词库添加到当前横线，点中横线里的词后可以前移、后移或删除。</p>
        <button class="btn" :disabled="!canSubmitPoem" @click="submitPoem">确认</button>
      </div>
    </template>

    <template v-else-if="gameState.currentPage === 1">
      <div class="front-panel invite-panel">
        <p>生成图片：房间派对邀请函。</p>
        <div class="invite-card">
          <span>{{ gameState.roomNumber || '2026' }}号房间</span>
          <strong>房间派对邀请函</strong>
          <p v-for="line in poemTextLines" :key="line">{{ line }}</p>
          <em v-if="inviteProfileLine" class="profile-line">{{ inviteProfileLine }}</em>
          <em>还记得那张橘色的寻人启事吗？让我们一起将它折成你喜欢的样子。</em>
        </div>
      </div>
    </template>

    <template v-else-if="gameState.currentPage === 2">
      <div class="waiting-state">
        <p>请抬头，看向房间。</p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { gameState, setAnswer } from '../../stores/game.js'
import { generateFrontPoemBlocks } from '../../services/talk.js'

const SLOT_COUNT = 3

const poemSlots = [
  { key: 'want', prefix: '我想要', suffix: '。' },
  { key: 'belief', prefix: '我认为', suffix: '是正确的。' },
  { key: 'texture', prefix: '我的生命本是', suffix: '的质感。' },
]

const baseWordBlocks = ['我', '你', '他', '她', '它', '这', '那', '在', '把', '被', '与', '的', '地', '得', '了', '不', '是', '如果', '但', '没有']

const baseBlocks = {
  want: baseWordBlocks,
  belief: baseWordBlocks,
  texture: baseWordBlocks,
}

const extensionFallbackBlocks = {
  want: ['把窗打开', '把房间加宽', '在梦里做梦', '从雨里回来', '慢慢呼吸', '重新命名'],
  belief: ['柔软也是力量', '沉默可以发声', '靠近不是占有', '离开也算回答'],
  texture: ['橘色纸张', '温热的水', '半透明的墙', '发亮的尘埃'],
  wild: ['煮一碗泡面', '把影子折好'],
}

const activeSlot = ref(0)
const activeBank = ref('base')
const selectedTokenIndex = ref(-1)
const loadingBlocks = ref(false)
const extensionBlocks = ref(readSavedBlocks())
const selectedWords = ref(readSavedSelectedWords())

const activeSlotKey = computed(() => poemSlots[activeSlot.value]?.key || poemSlots[0].key)
const activeBankLabel = computed(() => activeBank.value === 'base' ? '基础词库' : '扩展词库')
const normalizedExtensionBlocks = computed(() => normalizeExtensionBlocks(extensionBlocks.value))
const activeWords = computed(() => {
  const bank = activeBank.value === 'base' ? baseBlocks : normalizedExtensionBlocks.value
  return bank[activeSlotKey.value] || []
})

const canSubmitPoem = computed(() => selectedWords.value.every(words => Array.isArray(words) && words.length > 0))

const poemTextLines = computed(() => {
  if (!gameState.roomBase) return buildPoemLines()
  return String(gameState.roomBase).split(/\r?\n/).filter(Boolean)
})

const entryProfile = computed(() => readEntryProfile())

const inviteProfileLine = computed(() => {
  const profile = entryProfile.value
  if (!profile) return ''

  if (profile.quote) {
    return `你刚才说“${profile.quote}”，它会被折进这间房。`
  }

  const mood = profile.mood || ''
  const desire = profile.desire || profile.tendency || ''
  if (mood && desire) return `你带来的${mood}，会和${desire}一起留在这里。`
  if (desire) return `这间房会先收下你的${desire}。`
  return ''
})

onMounted(() => {
  if (!extensionBlocks.value) refreshExtensionBlocks()
})

function setBank(bank) {
  activeBank.value = bank === 'extension' ? 'extension' : 'base'
  if (activeBank.value === 'extension' && !extensionBlocks.value && !loadingBlocks.value) {
    refreshExtensionBlocks()
  }
}

function setActiveSlot(index) {
  activeSlot.value = index
  const words = slotWords(index)
  selectedTokenIndex.value = words.length ? Math.min(Math.max(selectedTokenIndex.value, 0), words.length - 1) : -1
}

function selectToken(slotIndex, wordIndex) {
  activeSlot.value = slotIndex
  selectedTokenIndex.value = wordIndex
}

function toggleWord(word) {
  const cleaned = normalizeWord(word)
  if (!cleaned) return

  const words = slotWords(activeSlot.value)
  const existingIndex = words.indexOf(cleaned)
  if (existingIndex >= 0) {
    selectedTokenIndex.value = existingIndex
    return
  }

  const nextWords = [...words, cleaned].slice(0, 5)
  setSlotWords(activeSlot.value, nextWords)
  selectedTokenIndex.value = nextWords.length - 1
}

function isWordSelected(word) {
  return slotWords(activeSlot.value).includes(normalizeWord(word))
}

function canMoveSelected(direction) {
  const words = slotWords(activeSlot.value)
  const nextIndex = selectedTokenIndex.value + direction
  return selectedTokenIndex.value >= 0 && nextIndex >= 0 && nextIndex < words.length
}

function moveSelectedWord(direction) {
  if (!canMoveSelected(direction)) return
  const words = [...slotWords(activeSlot.value)]
  const from = selectedTokenIndex.value
  const to = from + direction
  const temp = words[from]
  words[from] = words[to]
  words[to] = temp
  setSlotWords(activeSlot.value, words)
  selectedTokenIndex.value = to
}

function removeSelectedWord() {
  const words = [...slotWords(activeSlot.value)]
  if (selectedTokenIndex.value < 0 || selectedTokenIndex.value >= words.length) return
  words.splice(selectedTokenIndex.value, 1)
  setSlotWords(activeSlot.value, words)
  selectedTokenIndex.value = words.length ? Math.min(selectedTokenIndex.value, words.length - 1) : -1
}

function clearSlot(index) {
  setSlotWords(index, [])
  if (activeSlot.value === index) selectedTokenIndex.value = -1
}

async function refreshExtensionBlocks() {
  if (loadingBlocks.value) return
  loadingBlocks.value = true
  try {
    const result = await generateFrontPoemBlocks({
      entryWish: gameState.entryWish,
      entryChatLog: readEntryChatLog(),
      entryProfile: entryProfile.value,
      roomNumber: gameState.roomNumber,
    })
    extensionBlocks.value = result.blocks
    setAnswer('poemMaterials', JSON.stringify(result.blocks), { label: '扩展词库', text: '已生成扩展词库' })
    activeBank.value = 'extension'
  } catch {
    extensionBlocks.value = extensionFallbackBlocks
    setAnswer('poemMaterials', JSON.stringify(extensionFallbackBlocks), { label: '扩展词库', text: '已生成扩展词库' })
  } finally {
    loadingBlocks.value = false
  }
}

function submitPoem() {
  if (!canSubmitPoem.value) return
  const lines = buildPoemLines()
  gameState.roomPoemParts = JSON.stringify(selectedWords.value)
  setAnswer('roomBase', lines.join('\n'), { label: lines.join(' / '), text: lines.join('\n') })
  gameState.currentPage = 1
}

function buildPoemLines() {
  return poemSlots.map((slot, index) => `${slot.prefix}${joinWords(slotWords(index))}${slot.suffix}`)
}

function joinWords(words) {
  return (words && words.length ? words : ['____']).join('')
}

function slotWords(index) {
  return Array.isArray(selectedWords.value[index]) ? selectedWords.value[index] : []
}

function setSlotWords(index, words) {
  selectedWords.value.splice(index, 1, words.map(normalizeWord).filter(Boolean))
}

function readSavedBlocks() {
  if (!gameState.poemMaterials) return null
  try {
    const parsed = JSON.parse(gameState.poemMaterials)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function readSavedSelectedWords() {
  const empty = () => Array.from({ length: SLOT_COUNT }, () => [])
  try {
    const parsed = JSON.parse(gameState.roomPoemParts || '')
    if (!Array.isArray(parsed)) return empty()

    return Array.from({ length: SLOT_COUNT }, (_, index) => {
      const value = parsed[index]
      if (Array.isArray(value)) return uniqueList(value, 5)
      const word = normalizeWord(value)
      return word ? [word] : []
    })
  } catch {
    return empty()
  }
}

function readEntryProfile() {
  try {
    const parsed = JSON.parse(gameState.entryProfile || '{}')
    if (!parsed || typeof parsed !== 'object') return null
    return {
      desire: compactProfileText(parsed.desire, 14),
      mood: compactProfileText(parsed.mood, 10),
      imagery: Array.isArray(parsed.imagery)
        ? parsed.imagery.map(item => compactProfileText(item, 8)).filter(Boolean).slice(0, 4)
        : [],
      tendency: compactProfileText(parsed.tendency, 12),
      quote: compactProfileText(parsed.quote, 18),
    }
  } catch {
    return null
  }
}

function readEntryChatLog() {
  try {
    const parsed = JSON.parse(gameState.entryChatLog || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(message => message && (message.role === 'user' || message.role === 'assistant'))
      .map(message => ({
        role: message.role,
        content: String(message.content || '').trim().slice(0, 500),
      }))
      .filter(message => message.content)
      .slice(-16)
  } catch {
    return []
  }
}

function compactProfileText(value, maxLength) {
  return String(value || '')
    .replace(/["'“”‘’{}[\]]/g, '')
    .replace(/\s+/g, '')
    .trim()
    .slice(0, maxLength)
}

function normalizeExtensionBlocks(value) {
  const source = value && typeof value === 'object' ? value : extensionFallbackBlocks
  return {
    want: uniqueList([...(source.want || []), ...extensionFallbackBlocks.want], 18),
    belief: uniqueList([...(source.belief || []), ...extensionFallbackBlocks.belief], 18),
    texture: uniqueList([...(source.texture || []), ...extensionFallbackBlocks.texture], 18),
  }
}

function uniqueList(items, count) {
  const seen = new Set()
  const result = []
  for (const item of items || []) {
    const text = normalizeWord(item)
    if (!text || seen.has(text)) continue
    seen.add(text)
    result.push(text)
    if (result.length >= count) break
  }
  return result
}

function normalizeWord(value) {
  return String(value || '')
    .replace(/[，。；、,.!?！？;:]/g, '')
    .replace(/\s+/g, '')
    .trim()
    .slice(0, 12)
}
</script>

<style scoped>
.front-panel {
  width: min(100%, 470px);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 13px;
}

.poem-panel {
  justify-content: center;
  text-align: left;
}

.poem-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 4px;
}

.poem-kicker {
  display: block;
  margin-bottom: 4px;
  color: rgba(238, 204, 139, 0.56);
  font-size: 11px;
  letter-spacing: 2px;
}

.poem-header h1 {
  color: #f2eadb;
  font-size: 18px;
  font-weight: 300;
  line-height: 1.3;
}

.bank-tabs {
  flex: 0 0 auto;
  display: flex;
  gap: 6px;
  padding: 3px;
  border: 1px solid rgba(238, 204, 139, 0.13);
  border-radius: 10px;
  background: rgba(8, 6, 6, 0.28);
}

.bank-tabs button,
.mini-btn,
.refresh-btn {
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: rgba(242, 234, 219, 0.72);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.bank-tabs button {
  min-height: 30px;
  padding: 5px 9px;
}

.bank-tabs button.active {
  border-color: rgba(238, 204, 139, 0.28);
  background: rgba(221, 154, 73, 0.14);
  color: #f1cc86;
}

.poem-lines {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.poem-line-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.poem-line {
  min-height: 58px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  padding: 10px 12px;
  border: 1px solid rgba(238, 204, 139, 0.16);
  border-radius: 10px;
  background: rgba(8, 6, 6, 0.34);
  color: #f2eadb;
  cursor: pointer;
}

.poem-line.active {
  border-color: rgba(238, 204, 139, 0.74);
  background: rgba(221, 154, 73, 0.11);
}

.poem-prefix,
.poem-suffix {
  color: rgba(242, 234, 219, 0.84);
  font-size: 17px;
  line-height: 1.4;
  white-space: nowrap;
}

.poem-slot {
  min-width: 0;
  min-height: 38px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 2px 5px;
  border-bottom: 1px solid rgba(238, 204, 139, 0.48);
}

.poem-placeholder {
  color: rgba(242, 234, 219, 0.34);
  font-size: 14px;
}

.poem-token {
  min-height: 28px;
  padding: 5px 8px;
  border: 1px solid rgba(238, 204, 139, 0.2);
  border-radius: 999px;
  background: rgba(8, 6, 6, 0.36);
  color: #f1cc86;
  font: inherit;
  font-size: 14px;
  line-height: 1.1;
}

.poem-token.selected {
  border-color: rgba(246, 214, 152, 0.82);
  background: rgba(221, 154, 73, 0.24);
  color: #fff2ce;
}

.poem-line-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mini-btn,
.refresh-btn {
  min-height: 28px;
  padding: 5px 9px;
  border-color: rgba(238, 204, 139, 0.16);
  background: rgba(8, 6, 6, 0.28);
}

.mini-btn:disabled,
.refresh-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.mini-btn.subtle {
  color: rgba(242, 234, 219, 0.48);
}

.word-bank-shell {
  padding: 10px;
  border: 1px solid rgba(238, 204, 139, 0.13);
  border-radius: 10px;
  background: rgba(8, 6, 6, 0.26);
}

.word-bank-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
  color: rgba(238, 204, 139, 0.62);
  font-size: 12px;
  letter-spacing: 1px;
}

.word-bank {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 8px;
}

.word-chip {
  min-height: 38px;
  padding: 8px 11px;
  border: 1px solid rgba(238, 204, 139, 0.2);
  border-radius: 999px;
  background: rgba(8, 6, 6, 0.34);
  color: #f2eadb;
  font: inherit;
  font-size: 15px;
}

.word-chip.selected {
  border-color: rgba(238, 204, 139, 0.82);
  background: rgba(221, 154, 73, 0.24);
  color: #f1cc86;
}

.poem-help {
  width: 100%;
  max-width: none;
  margin: -2px 0 0;
  color: rgba(242, 234, 219, 0.42);
  font-size: 12px;
  line-height: 1.5;
  text-align: left;
  opacity: 1;
  animation: none;
}

.invite-card {
  width: min(100%, 360px);
  min-height: 420px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 14px;
  padding: 28px 24px;
  border: 1px solid rgba(238, 204, 139, 0.24);
  border-radius: 8px;
  background: rgba(8, 6, 6, 0.42);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.22);
}

.invite-card span,
.invite-card em {
  color: rgba(242, 234, 219, 0.72);
  font-size: 13px;
  line-height: 1.7;
  font-style: normal;
}

.invite-card strong {
  color: #f1cc86;
  font-size: 24px;
  font-weight: 300;
}

.invite-card p {
  width: 100%;
  opacity: 1;
  animation: none;
  font-size: 16px;
  line-height: 1.8;
  margin: 0;
}

.invite-card .profile-line {
  color: rgba(246, 214, 152, 0.86);
}

@media (max-width: 520px) {
  .front-panel {
    gap: 11px;
  }

  .poem-header {
    align-items: stretch;
    flex-direction: column;
  }

  .bank-tabs {
    width: 100%;
  }

  .bank-tabs button {
    flex: 1;
  }

  .poem-line {
    grid-template-columns: 1fr;
    gap: 5px;
  }

  .poem-prefix,
  .poem-suffix {
    white-space: normal;
  }
}
</style>
