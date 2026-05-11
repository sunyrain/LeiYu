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

    <template v-else-if="gameState.currentPage === 2">
      <p>你看向镜子，</p>
      <p>里面是____10____</p>
      <div class="question-label">10.</div>
      <div class="choices">
        <button
          v-for="option in mirrorOptions"
          :key="option.value"
          class="choice-btn"
          :class="{ selected: mirrorChoice === option.value }"
          @click="mirrorChoice = option.value"
        >
          【{{ option.value }}】{{ option.label }}
        </button>
      </div>
      <button class="btn" :disabled="!mirrorChoice" @click="submitMirror">确认</button>
    </template>

    <template v-else-if="gameState.currentPage === 3">
      <p>你再次看见那个名字。</p>
      <p class="highlight">{{ gameState.lovedOneName || '那个名字' }}</p>
      <p>它正在变成____11____。</p>
      <div class="question-label">11.</div>
      <div class="choices">
        <button
          v-for="option in transformOptions"
          :key="option.value"
          class="choice-btn"
          :class="{ selected: transformChoice === option.value }"
          @click="transformChoice = option.value"
        >
          【{{ option.value }}】{{ option.label }}
        </button>
      </div>
      <button class="btn" :disabled="!transformChoice" @click="submitTransform">确认</button>
    </template>

    <template v-else-if="gameState.currentPage === 4">
      <p>{{ items.join('、') }}亮晶晶的，</p>
      <p>你____12____</p>
      <div class="question-label">12.</div>
      <div class="choices">
        <button
          v-for="option in objectOptions"
          :key="option.value"
          class="choice-btn"
          :class="{ selected: objectChoice === option.value }"
          @click="objectChoice = option.value"
        >
          【{{ option.value }}】{{ option.label }}
        </button>
      </div>
      <button class="btn" :disabled="!objectChoice" @click="submitObject">确认</button>
    </template>

    <template v-else-if="gameState.currentPage === 5">
      <p>你____13____。</p>
      <div class="question-label">13.</div>
      <div class="choices">
        <template
          v-for="option in finalOptions"
          :key="option.value"
        >
          <button
            v-if="option.value !== 'D'"
            class="choice-btn"
            :class="{ selected: finalChoice === option.value }"
            @click="selectFinal(option.value)"
          >
            【{{ option.value }}】{{ option.label }}
          </button>
          <label
            v-else
            class="choice-btn choice-btn-input"
            :class="{ selected: finalChoice === option.value }"
            @click="selectFinal(option.value)"
          >
            <span>【{{ option.value }}】</span>
            <input
              type="text"
              v-model="customFinal"
              class="inline-choice-input"
              placeholder="写下你的结局"
              @focus="selectFinal(option.value)"
              @click.stop
              @keyup.enter.stop="submitFinal"
            />
          </label>
        </template>
      </div>
      <button class="btn" :disabled="!canSubmitFinal" @click="submitFinal">确认</button>
    </template>

    <template v-else>
      <div class="ending-state">
        <p class="ending-title">2026号房间</p>
        <p class="ending-text">雨声已经退到窗外。</p>
        <p class="ending-text">房间把你的名字轻轻收好。</p>
        <p class="ending-sub">谢谢来到这里</p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { gameState, setAnswer } from '../../stores/game.js'
import { runChoiceOutro } from '../../utils/choiceOutro.js'

const mirrorChoice = ref('')
const transformChoice = ref('')
const objectChoice = ref('')
const finalChoice = ref('')
const customFinal = ref('')

const items = computed(() => {
  const raw = gameState.floodItem || ''
  const parts = raw.split(/[,，、\s]+/).filter(Boolean)
  while (parts.length < 3) parts.push('物件')
  return parts.slice(0, 3)
})

const currentBlock = computed(() => {
  const blocks = {
    0: {
      lines: ['2026号的你。'],
    },
    1: {
      lines: [
        '你站在自己的房间里，',
        '那寻人启事还在，',
        '但你没有去触碰它。',
      ],
    },
  }
  return blocks[gameState.currentPage]
})

const mirrorOptions = [
  { value: 'A', label: '一个站稳的人' },
  { value: 'B', label: '一个还在发抖的人' },
  { value: 'C', label: '一个准备离开的人' },
  { value: 'D', label: '一个只是看着的人' },
]

const transformOptions = [
  { value: 'A', label: '新鲜的光影' },
  { value: 'B', label: '昨日的午餐' },
  { value: 'C', label: '耳边的轻痣' },
  { value: 'D', label: '渐远的雨声' },
]

const objectOptions = [
  { value: 'A', label: '打开门' },
  { value: 'B', label: '躺下' },
  { value: 'C', label: '站着不动' },
  { value: 'D', label: '开始收拾东西' },
]

const finalOptions = [
  { value: 'A', label: '轻轻地笑了' },
  { value: 'B', label: '再次睡去' },
  { value: 'C', label: '久久站立' },
  { value: 'D', label: '___________' },
]

const canSubmitFinal = computed(() => {
  if (!finalChoice.value) return false
  if (finalChoice.value !== 'D') return true
  return Boolean(customFinal.value.trim())
})

function selectFinal(value) {
  finalChoice.value = value
}

async function submitMirror(event) {
  if (!mirrorChoice.value) return
  const option = mirrorOptions.find(item => item.value === mirrorChoice.value)
  setAnswer('mirrorSelf', mirrorChoice.value, { label: option.label })
  await runChoiceOutro({
    event,
    advance: () => {
      gameState.currentPage = 3
    },
  })
}

async function submitTransform(event) {
  if (!transformChoice.value) return
  const option = transformOptions.find(item => item.value === transformChoice.value)
  setAnswer('finalTransform', transformChoice.value, { label: option.label })
  await runChoiceOutro({
    event,
    advance: () => {
      gameState.currentPage = 4
    },
  })
}

async function submitObject(event) {
  if (!objectChoice.value) return
  const option = objectOptions.find(item => item.value === objectChoice.value)
  setAnswer('objectAction', objectChoice.value, { label: option.label })
  await runChoiceOutro({
    event,
    advance: () => {
      gameState.currentPage = 5
    },
  })
}

async function submitFinal(event) {
  if (!canSubmitFinal.value) return
  const option = finalOptions.find(item => item.value === finalChoice.value)
  const label = finalChoice.value === 'D' ? customFinal.value.trim() : option.label
  const value = finalChoice.value === 'D' ? label : finalChoice.value
  setAnswer('finalAction', value, { label, text: label })
  await runChoiceOutro({
    event,
    advance: () => {
      gameState.currentPage = 6
    },
  })
}
</script>
