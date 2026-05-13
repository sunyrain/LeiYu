<template>
  <div class="page">
    <template v-if="currentBlock">
      <p
        v-for="(line, index) in currentBlock.lines"
        :key="index"
        :class="currentBlock.className"
      >
        {{ line }}
      </p>
    </template>

    <template v-else-if="gameState.currentPage === 6">
      <div class="poem-builder">
        <div class="poem-slots">
          <div
            v-for="(slot, index) in slotTemplates"
            :key="slot.key"
            class="poem-slot"
            :class="{ active: activeSlot === index }"
            @click="activeSlot = index"
          >
            <div class="slot-line">
              <span>{{ slot.prefix }}</span>
              <span class="slot-content">{{ slotText(index) || '____' }}</span>
              <span>{{ slot.suffix }}</span>
            </div>
            <div class="selected-blocks">
              <span
                v-for="(block, blockIndex) in poemSlots[index]"
                :key="`${block}-${blockIndex}`"
                class="selected-chip"
              >
                <button type="button" @click.stop="moveBlock(index, blockIndex, -1)">‹</button>
                <span>{{ block }}</span>
                <button type="button" @click.stop="moveBlock(index, blockIndex, 1)">›</button>
                <button type="button" @click.stop="removeBlock(index, blockIndex)">×</button>
              </span>
            </div>
          </div>
        </div>

        <div class="palette-tabs" aria-label="素材分类">
          <button
            v-for="tab in paletteTabs"
            :key="tab.key"
            type="button"
            class="palette-tab"
            :class="{ active: activePaletteKey === tab.key }"
            @click="activePaletteKey = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>

        <div class="material-panel">
          <div class="material-panel-head">
            <span>{{ activePaletteGroup.label }} · 填入{{ activeSlotLabel }}</span>
            <button
              v-if="activePaletteKey === 'generated'"
              type="button"
              class="refresh-btn"
              :disabled="loading"
              @click="refreshMaterials"
            >
              {{ loading ? '生成中' : '刷新' }}
            </button>
          </div>
          <div class="material-chips">
            <button
              v-for="block in activePaletteItems"
              :key="block"
              type="button"
              class="material-chip"
              @click="addBlock(block)"
            >
              {{ block }}
            </button>
          </div>
        </div>

        <div class="palette-toolbar">
          <input
            type="text"
            v-model="customBlock"
            class="custom-block-input"
            placeholder="自定义词块"
            @keyup.enter="addCustomBlock"
          />
          <button type="button" class="small-btn" :disabled="!customBlock.trim()" @click="addCustomBlock">
            添加
          </button>
        </div>
      </div>
      <button class="btn" :disabled="!canSubmitRoom" @click="submitRoom">确认</button>
    </template>

    <template v-else-if="gameState.currentPage === 7">
      <p>看见你的2026号公寓、房间，</p>
      <p>你____</p>
      <div class="choices">
        <button
          v-for="option in identityOptions"
          :key="option.value"
          class="choice-btn"
          :class="{ selected: identityChoice === option.value }"
          @click="identityChoice = option.value"
        >
          {{ option.label }}
        </button>
      </div>
      <button class="btn" :disabled="!identityChoice" @click="submitIdentity">确认</button>
    </template>

    <template v-else>
      <div class="waiting-state">
        <p>请静静感受此刻</p>
        <p class="waiting-sub">等待剧情继续</p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { gameState, setAnswer } from '../../stores/game.js'
import { generatePoemMaterials } from '../../llm.js'
import { onBackendEvent } from '../../services/backend.js'

const identityChoice = ref(gameState.identity || '')
const loading = ref(false)
const poemMaterials = ref(readSavedMaterials())
const activeSlot = ref(0)
const activePaletteKey = ref('generated')
const customBlock = ref('')
const poemSlots = ref(readSavedPoemSlots())
let removeLlmTrigger = null

const items = computed(() => {
  const raw = gameState.floodItem || ''
  const parts = raw.split(/[,，、\s]+/).filter(Boolean)
  while (parts.length < 3) parts.push('物件')
  return parts.slice(0, 3)
})

const currentBlock = computed(() => {
  const blocks = {
    0: {
      lines: [
        `${gameState.roomNumber || ''}号，请前往，`,
        '或者说回到，',
        '2026号——你的房间。',
      ],
    },
    1: {
      lines: [
        '透过你的窗户，那扇贴着寻人启事的窗，',
        '你看到雨没停，',
        '而河水正静静流淌。',
      ],
    },
    2: {
      lines: [
        '你站在里面，',
        '觉得自己也可以不再漂流。',
      ],
    },
    3: {
      lines: ['一切刚刚好。'],
    },
    4: {
      lines: [
        '那三样东西还在。',
        `${items.value[0]}上有水。`,
        `${items.value[1]}倒在一边。`,
        `${items.value[2]}安静地放着。`,
      ],
    },
    5: {
      lines: [
        '你把它们擦拭整洁，放在喜欢的位置。',
        '你慢慢整理这个房间。',
      ],
    },
  }
  return blocks[gameState.currentPage]
})

const slotTemplates = [
  { key: 'floor', label: '地面', prefix: '让', suffix: '成为地面，' },
  { key: 'wall', label: '挡水', prefix: '让', suffix: '挡住外面的水，' },
  { key: 'roof', label: '屋顶', prefix: '让', suffix: '盖在头顶，' },
  { key: 'nearby', label: '身边', prefix: '再把', suffix: '放在你的身边。' },
]

const baseBlocks = ['我', '你', '他', '她', '它', '这', '那', '在', '把', '被', '与', '的', '地', '得', '了', '不', '是', '如果', '但', '没有']

const generatedBlocks = computed(() => {
  const m = normalizeMaterials(poemMaterials.value)
  return [
    ...m.imagery,
    ...m.spatial,
    ...m.texture,
    ...m.states,
  ].filter(Boolean).slice(0, 16)
})

const paletteTabs = computed(() => [
  { key: 'generated', label: '灵感词块', items: generatedBlocks.value },
  { key: 'base', label: '基础词块', items: baseBlocks },
])

const activePaletteGroup = computed(() => {
  return paletteTabs.value.find(tab => tab.key === activePaletteKey.value) || paletteTabs.value[0]
})

const activePaletteItems = computed(() => activePaletteGroup.value?.items || [])
const activeSlotLabel = computed(() => slotTemplates[activeSlot.value]?.label || '')

const canSubmitRoom = computed(() => poemSlots.value.every(slot => slot.length > 0))

const identityOptions = [
  { value: 'A', label: '稳稳地站住脚跟' },
  { value: 'B', label: '不止地颤栗起来' },
  { value: 'C', label: '阔步向门外走去' },
  { value: 'D', label: '安心地闭上眼睛' },
]

function normalizeMaterials(value) {
  const fallback = {
    imagery: [items.value[0], items.value[1], items.value[2], '半开的门缝', `${gameState.lovedOneName || '那个名字'}的影子`],
    spatial: ['一块缓慢下沉的布', '倾斜的墙面', '没有尽头的台阶', '贴着窗沿的浅水', '折起来的夜晚'],
    texture: ['柔软', '明亮', '温热'],
    states: ['轻轻晃动', '慢慢堆积', '贴着不动'],
  }
  return {
    imagery: [...(value?.imagery || []), ...fallback.imagery].filter(Boolean).slice(0, 5),
    spatial: [...(value?.spatial || []), ...(value?.motion || []), ...fallback.spatial].filter(Boolean).slice(0, 5),
    texture: [...(value?.texture || []), ...fallback.texture].filter(Boolean).slice(0, 3),
    states: [...(value?.states || []), ...(value?.bridges || []), ...fallback.states].filter(Boolean).slice(0, 3),
  }
}

function clipText(value, maxLength = 8) {
  const text = String(value || '')
    .replace(/[，。；、,.!?！？;:\s]+/g, '')
    .trim()
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength)
}

function readSavedMaterials() {
  if (!gameState.poemMaterials) return null
  try {
    return JSON.parse(gameState.poemMaterials)
  } catch {
    return null
  }
}

function readSavedPoemSlots() {
  try {
    const parsed = JSON.parse(gameState.roomPoemParts || '')
    if (Array.isArray(parsed) && parsed.length === 4) {
      return parsed.map(slot => Array.isArray(slot) ? slot.map(String).filter(Boolean) : [])
    }
  } catch {}
  return [[], [], [], []]
}

function slotText(index) {
  return poemSlots.value[index].join('')
}

function addBlock(block) {
  const text = clipText(block, 14)
  if (!text) return
  poemSlots.value[activeSlot.value].push(text)
}

function addCustomBlock() {
  addBlock(customBlock.value)
  customBlock.value = ''
}

function removeBlock(slotIndex, blockIndex) {
  poemSlots.value[slotIndex].splice(blockIndex, 1)
}

function moveBlock(slotIndex, blockIndex, direction) {
  const slot = poemSlots.value[slotIndex]
  const nextIndex = blockIndex + direction
  if (nextIndex < 0 || nextIndex >= slot.length) return
  const [block] = slot.splice(blockIndex, 1)
  slot.splice(nextIndex, 0, block)
}

function buildRoomPoem() {
  return [
    `让${slotText(0)}成为地面，`,
    `让${slotText(1)}挡住外面的水，`,
    `让${slotText(2)}盖在头顶，`,
    `再把${slotText(3)}放在你的身边。`,
  ].join('\n')
}

async function loadMaterials(force = false) {
  if (loading.value) return
  if (!force && poemMaterials.value) return
  loading.value = true
  try {
    const result = await generatePoemMaterials({
      floodItem: gameState.floodItem,
      lovedOneName: gameState.lovedOneName,
      departureAction: gameState.departureAction,
      reunionAction: gameState.reunionAction,
      noticeAction: gameState.noticeAction,
      riverAction: gameState.riverAction,
    })
    poemMaterials.value = result
    setAnswer('poemMaterials', JSON.stringify(result))
  } catch (error) {
    console.error('LLM generation failed:', error)
    poemMaterials.value = null
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  if (!poemMaterials.value) await loadMaterials()
  removeLlmTrigger = onBackendEvent('llmTrigger', () => {
    if (gameState.currentPhase === 'act3') loadMaterials(true)
  })
})

onUnmounted(() => {
  if (removeLlmTrigger) removeLlmTrigger()
})

function refreshMaterials() {
  loadMaterials(true)
}

function submitRoom() {
  if (!canSubmitRoom.value) return
  const poem = buildRoomPoem()
  gameState.roomPoemParts = JSON.stringify(poemSlots.value)
  setAnswer('roomBase', poem, { label: poem, text: poem })
  gameState.currentPage = 7
}

function submitIdentity() {
  if (!identityChoice.value) return
  const option = identityOptions.find(item => item.value === identityChoice.value)
  setAnswer('identity', identityChoice.value, { label: option.label })
  gameState.currentPage = 8
}
</script>

<style scoped>
.page:has(.poem-builder) {
  justify-content: flex-start;
  padding-top: calc(78px + env(safe-area-inset-top));
  padding-bottom: calc(82px + env(safe-area-inset-bottom));
}

.poem-builder {
  width: min(100%, 380px);
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin: 0 auto;
  position: relative;
  z-index: 4;
}

.page:has(.poem-builder) > .btn {
  position: sticky;
  bottom: calc(18px + env(safe-area-inset-bottom));
  z-index: 5;
  margin-top: 14px;
  background: rgba(9, 5, 4, 0.72);
}

.poem-slots {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.poem-slot {
  width: 100%;
  min-height: 46px;
  padding: 8px 10px;
  border: 1px solid rgba(220, 178, 104, 0.18);
  border-radius: 7px;
  background: rgba(7, 5, 5, 0.38);
  text-align: left;
}

.poem-slot.active {
  border-color: rgba(238, 207, 146, 0.68);
  background: rgba(220, 178, 104, 0.09);
}

.slot-line {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  color: rgba(238, 230, 214, 0.86);
  font-size: 15px;
  line-height: 1.52;
}

.slot-content {
  color: #f0c979;
  overflow-wrap: anywhere;
}

.selected-blocks {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 5px;
}

.selected-chip,
.material-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid rgba(220, 178, 104, 0.22);
  border-radius: 999px;
  background: rgba(10, 7, 6, 0.42);
  color: rgba(238, 230, 214, 0.82);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.4;
}

.selected-chip {
  padding: 2px 5px;
}

.selected-chip button {
  width: 17px;
  height: 17px;
  border: 0;
  border-radius: 50%;
  background: rgba(238, 207, 146, 0.1);
  color: rgba(238, 230, 214, 0.72);
  font: inherit;
  line-height: 1;
}

.palette-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
}

.palette-tab {
  min-height: 30px;
  padding: 0 11px;
  border: 1px solid rgba(220, 178, 104, 0.2);
  border-radius: 999px;
  background: rgba(7, 5, 5, 0.32);
  color: rgba(238, 230, 214, 0.58);
  font-family: inherit;
  font-size: 14px;
}

.palette-tab.active {
  border-color: rgba(238, 207, 146, 0.62);
  background: rgba(220, 178, 104, 0.12);
  color: #f0c979;
}

.palette-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.small-btn {
  min-height: 32px;
  border: 1px solid rgba(220, 178, 104, 0.28);
  border-radius: 8px;
  background: rgba(10, 7, 6, 0.44);
  color: #e7c887;
  padding: 0 10px;
  font-family: inherit;
  font-size: 14px;
}

.small-btn:disabled {
  opacity: 0.35;
}

.custom-block-input {
  width: 100%;
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  border: 1px solid rgba(220, 178, 104, 0.24);
  border-radius: 8px;
  background: rgba(7, 5, 5, 0.36);
  color: #eee6d6;
  font: inherit;
  font-size: 14px;
  text-align: left;
}

.custom-block-input:focus {
  outline: none;
  border-color: rgba(238, 207, 146, 0.64);
}

.material-panel {
  padding: 9px 10px 10px;
  border: 1px solid rgba(220, 178, 104, 0.12);
  border-radius: 8px;
  background: rgba(7, 5, 5, 0.24);
}

.material-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
  color: rgba(224, 190, 122, 0.56);
  font-size: 13px;
  text-align: left;
}

.refresh-btn {
  flex: 0 0 auto;
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid rgba(220, 178, 104, 0.22);
  border-radius: 999px;
  background: rgba(10, 7, 6, 0.4);
  color: rgba(231, 200, 135, 0.78);
  font-family: inherit;
  font-size: 13px;
}

.refresh-btn:disabled {
  opacity: 0.35;
}

.material-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  max-height: 112px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.material-chip {
  min-height: 29px;
  padding: 5px 9px;
  cursor: pointer;
}

.material-chip:active,
.selected-chip button:active,
.small-btn:active,
.refresh-btn:active,
.palette-tab:active {
  border-color: rgba(238, 207, 146, 0.58);
  background: rgba(220, 178, 104, 0.13);
}

@media (max-height: 740px) {
  .page:has(.poem-builder) {
    padding-top: calc(68px + env(safe-area-inset-top));
    padding-bottom: calc(72px + env(safe-area-inset-bottom));
  }

  .poem-builder {
    gap: 7px;
  }

  .poem-slot {
    min-height: 40px;
    padding: 7px 9px;
  }

  .slot-line {
    font-size: 14px;
    line-height: 1.45;
  }

  .material-chips {
    max-height: 86px;
  }
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.loading-dots {
  display: flex;
  gap: 8px;
}

.loading-dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(201, 169, 110, 0.5);
  animation: dotPulse 1.4s ease-in-out infinite;
}

.loading-dots span:nth-child(2) { animation-delay: 0.2s; }
.loading-dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes dotPulse {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1.2); }
}
</style>
