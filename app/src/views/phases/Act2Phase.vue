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

    <template v-else-if="gameState.currentPage === 5">
      <p>你跟着它们，</p>
      <p>再次看向手中的寻人启事。</p>
      <p>你忽然想要____3____</p>
      <div class="question-label">3.</div>
      <div class="choices">
        <button
          v-for="option in noticeOptions"
          :key="option.value"
          class="choice-btn"
          :class="{ selected: noticeChoice === option.value }"
          @click="noticeChoice = option.value"
        >
          【{{ option.value }}】{{ option.label }}
        </button>
      </div>
      <button class="btn" :disabled="!noticeChoice" @click="submitNotice">确认</button>
    </template>

    <template v-else-if="gameState.currentPage === 7">
      <p>而河水已经涨到你的脚边。</p>
      <p>你不得不____4____</p>
      <div class="question-label">4.</div>
      <div class="choices">
        <button
          v-for="option in riverOptions"
          :key="option.value"
          class="choice-btn"
          :class="{ selected: riverChoice === option.value }"
          @click="riverChoice = option.value"
        >
          【{{ option.value }}】{{ option.label }}
        </button>
      </div>
      <button class="btn" :disabled="!riverChoice" @click="submitRiver">确认</button>
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
import { computed, ref } from 'vue'
import { gameState, setAnswer } from '../../stores/game.js'
import { runChoiceOutro } from '../../utils/choiceOutro.js'

const items = computed(() => {
  const raw = gameState.floodItem || ''
  const parts = raw.split(/[,，、\s]+/).filter(Boolean)
  while (parts.length < 3) parts.push('那三样东西')
  return parts.slice(0, 3)
})

const currentBlock = computed(() => {
  const blocks = {
    0: {
      lines: [`${gameState.roomNumber || ''}号，你已经来到2026号——雷暴。`],
    },
    1: {
      lines: [
        '你不得不从那里走出来，',
        '站在岸边。',
        '河水涨起来了。',
      ],
    },
    2: {
      lines: [
        '那张寻人启事你仍握在手中。',
        '你可以撕碎它，',
        '或者，让它飞走。',
      ],
    },
    3: {
      lines: [
        '但你紧紧攥着它，',
        '手心是湿的，',
        '纸张变得软。',
      ],
      projection: '“你走吧。请你，再一次，离开吧。都走吧！而我攥着这张纸，不是要你回来，是我想要、选择站在这里。去，把窗户打开，我要站在所有灰暗的窗，把那天上拧结着电流的东西请进来。”',
    },
    4: {
      lines: [
        `你看到你房间里的${items.value.join('、')}震颤起来，`,
        '与窗外铺天盖地的水珠一起流动起来。',
      ],
    },
    6: {
      lines: [
        '这场雷暴早已不在窗外。',
        '你看见一个人跳进了那条河，',
        '还有一个从身边跑了过去。',
      ],
      projection: '“水涨上来了，岸快不见了。我感到我正被溶解为一片一片的软弱。拆开这面墙，拆开这一切吧。就这一刻，我想要轻轻躺在水面上，散开或者流走。”',
    },
  }
  return blocks[gameState.currentPage]
})

const noticeChoice = ref('')
const riverChoice = ref('')

const noticeOptions = [
  { value: 'A', label: '撕碎它' },
  { value: 'B', label: '折起来，继续握着' },
  { value: 'C', label: '松手，让它落下' },
  { value: 'D', label: '贴回窗边' },
]

const riverOptions = [
  { value: 'A', label: '跳进去' },
  { value: 'B', label: '抓住什么' },
  { value: 'C', label: '闭上眼睛' },
  { value: 'D', label: '看着它' },
]

async function submitNotice(event) {
  if (!noticeChoice.value) return
  const option = noticeOptions.find(item => item.value === noticeChoice.value)
  setAnswer('noticeAction', noticeChoice.value, { label: option.label })
  await runChoiceOutro({
    event,
    advance: () => {
      gameState.currentPage = 6
    },
  })
}

async function submitRiver(event) {
  if (!riverChoice.value) return
  const option = riverOptions.find(item => item.value === riverChoice.value)
  setAnswer('riverAction', riverChoice.value, { label: option.label })
  await runChoiceOutro({
    event,
    advance: () => {
      gameState.currentPage = 8
    },
  })
}
</script>
