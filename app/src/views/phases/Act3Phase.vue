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
      <p v-if="currentBlock.projection" class="projection">
        {{ currentBlock.projection }}
      </p>
    </template>

    <template v-else-if="gameState.currentPage === 6">
      <p>你让____5____成为地面，</p>
      <p>让____6____挡住外面的水，</p>
      <p>让____7____盖在头顶，</p>
      <p>再把____8____放在你的身边。</p>
      <p v-if="loading" class="hint-line">正在生成房间素材，当前可先选择基础版本。</p>
      <div class="question-label">5-8.</div>
      <div class="choices">
        <button
          v-for="(option, index) in roomOptions"
          :key="index"
          class="choice-btn"
          :class="{ selected: roomChoice === choiceValues[index] }"
          @click="roomChoice = choiceValues[index]"
        >
          【{{ choiceValues[index] }}】{{ option }}
        </button>
      </div>
      <button class="btn" :disabled="!roomChoice" @click="submitRoom">确认</button>
    </template>

    <template v-else-if="gameState.currentPage === 7">
      <p>看见你的2026号公寓、房间，</p>
      <p>你____9____</p>
      <div class="question-label">9.</div>
      <div class="choices">
        <button
          v-for="option in identityOptions"
          :key="option.value"
          class="choice-btn"
          :class="{ selected: identityChoice === option.value }"
          @click="identityChoice = option.value"
        >
          【{{ option.value }}】{{ option.label }}
        </button>
      </div>
      <button class="btn" :disabled="!identityChoice" @click="submitIdentity">确认</button>
    </template>

    <template v-else>
      <div class="waiting-state">
        <p>请静静感受此刻。</p>
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
import { runChoiceOutro } from '../../utils/choiceOutro.js'

const choiceValues = ['A', 'B', 'C', 'D']
const roomChoice = ref('')
const identityChoice = ref('')
const loading = ref(false)
const poemMaterials = ref(null)
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
      projection: '“好久不见。你都好吗？我都好。是啊，雨停了。水也退下去了。是吗？那你还会回来吗？噢，再见。”',
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

const fallbackRoomOptions = computed(() => [
  `让${clipText(items.value[0])}成为地面，让${clipText(items.value[1])}挡水，让${clipText(items.value[2])}盖顶，把${clipText(gameState.lovedOneName || '那个名字')}放身边`,
  `让${clipText(items.value[1])}成为地面，让${clipText(items.value[2])}挡水，让${clipText(gameState.lovedOneName || '那个人')}盖顶，把${clipText(items.value[0])}放身边`,
  `让${clipText(items.value[2])}成为地面，让${clipText(items.value[0])}挡水，让安静盖顶，把${clipText(items.value[1])}放身边`,
  '让明亮成为地面，让呼吸挡水，让旧雨声盖顶，把三样东西放身边',
])

const roomOptions = computed(() => {
  if (!poemMaterials.value) return fallbackRoomOptions.value
  const m = normalizeMaterials(poemMaterials.value)
  return [
    `让${clipText(m.imagery[0])}成为地面，让${clipText(m.texture[0])}挡水，让${clipText(m.imagery[1])}盖顶，把${clipText(m.sentences[0], 12)}放身边`,
    `让${clipText(m.imagery[2])}成为地面，让${clipText(m.motion[0])}挡水，让${clipText(m.texture[1])}盖顶，把${clipText(items.value[0])}放身边`,
    `让${clipText(items.value[1])}成为地面，让${clipText(m.imagery[3])}挡水，让${clipText(m.motion[1])}盖顶，把${clipText(m.sentences[1], 12)}放身边`,
    `让${clipText(items.value[2])}成为地面，让${clipText(m.texture[2])}挡水，让${clipText(m.bridges[1])}盖顶，把${clipText(gameState.lovedOneName || '那个名字')}放身边`,
  ]
})

const identityOptions = [
  { value: 'A', label: '稳稳地站住脚跟' },
  { value: 'B', label: '不止地颤栗起来' },
  { value: 'C', label: '阔步向门外走去' },
  { value: 'D', label: '安心地闭上眼睛' },
]

function normalizeMaterials(value) {
  const fallback = {
    imagery: [items.value[0], items.value[1], items.value[2], '半开的门缝'],
    motion: ['轻轻翻身', '慢慢折返'],
    texture: ['柔软', '明亮', '温热'],
    bridges: ['在雨停之前，', '像刚醒来时，'],
    sentences: [`${gameState.lovedOneName || '那个名字'}把灯放回掌心`, '房间把呼吸轻轻收好'],
  }
  return {
    imagery: [...(value.imagery || []), ...fallback.imagery].slice(0, 4),
    motion: [...(value.motion || []), ...fallback.motion].slice(0, 2),
    texture: [...(value.texture || []), ...fallback.texture].slice(0, 3),
    bridges: [...(value.bridges || []), ...fallback.bridges].slice(0, 2),
    sentences: [...(value.sentences || []), ...fallback.sentences].slice(0, 2),
  }
}

function clipText(value, maxLength = 8) {
  const text = String(value || '')
    .replace(/[，。；、,.!?！？;:\s]+/g, '')
    .trim()
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength)
}

async function loadMaterials() {
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
  await loadMaterials()
  removeLlmTrigger = onBackendEvent('llmTrigger', () => {
    if (gameState.currentPhase === 'act3') loadMaterials()
  })
})

onUnmounted(() => {
  if (removeLlmTrigger) removeLlmTrigger()
})

async function submitRoom(event) {
  if (!roomChoice.value) return
  const index = choiceValues.indexOf(roomChoice.value)
  const label = roomOptions.value[index]
  setAnswer('roomBase', roomChoice.value, { label })
  await runChoiceOutro({
    event,
    advance: () => {
      gameState.currentPage = 7
    },
  })
}

async function submitIdentity(event) {
  if (!identityChoice.value) return
  const option = identityOptions.find(item => item.value === identityChoice.value)
  setAnswer('identity', identityChoice.value, { label: option.label })
  await runChoiceOutro({
    event,
    advance: () => {
      gameState.currentPage = 8
    },
  })
}
</script>

<style scoped>
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
