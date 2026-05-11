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

    <template v-else-if="gameState.currentPage === 4">
      <p>房间只剩下三样你不舍得丢掉的东西。</p>
      <p class="hint-line">比如出生时母亲折叠在你颈下的浅绿色毛巾，ta送给你的水晶球，和一张挂在床头的购物标签。</p>
      <div class="flood-lines">
        <input
          v-for="(_, index) in floodInputs"
          :key="index"
          type="text"
          v-model="floodInputs[index]"
          class="line-input flood-line-input"
          :placeholder="floodPlaceholders[index]"
          :aria-label="floodPlaceholders[index]"
          @keyup.enter="handleFloodEnter(index, $event)"
        />
      </div>
      <p>你想，若是暴雨将你淹没，</p>
      <p>你会首先带走它们。</p>
      <button class="btn" :disabled="!canSubmitFlood" @click="submitFlood">确认</button>
    </template>

    <template v-else-if="gameState.currentPage === 9">
      <p>这是你难以彻底消磨的寻人启事。</p>
      <p>如果可以，</p>
      <p>你想叫出此时心头那个呼之欲出却又只能努力吞咽的名字。</p>
      <p class="hint-line">如在群山中向将行的车窗内伸手握住你的外公，如那个隔着时差相互惦念的人，如虽失去却深深祝福的记忆中的人。</p>
      <input
        type="text"
        v-model="nameInput"
        class="line-input"
        placeholder="写下那个名字"
        @keyup.enter="submitName"
      />
      <button class="btn" @click="submitName">确认</button>
    </template>

    <template v-else-if="gameState.currentPage === 10">
      <p>Ta要走了，你想____1____。</p>
      <div class="question-label">1.</div>
      <div class="choices">
        <button
          v-for="option in departureOptions"
          :key="option.value"
          class="choice-btn"
          :class="{ selected: departureChoice === option.value }"
          @click="departureChoice = option.value"
        >
          【{{ option.value }}】{{ option.label }}
        </button>
      </div>
      <button class="btn" :disabled="!departureChoice" @click="submitDeparture">确认</button>
    </template>

    <template v-else-if="gameState.currentPage === 11">
      <p>如果Ta重新出现，你会____2____。</p>
      <div class="question-label">2.</div>
      <div class="choices">
        <button
          v-for="option in reunionOptions"
          :key="option.value"
          class="choice-btn"
          :class="{ selected: reunionChoice === option.value }"
          @click="reunionChoice = option.value"
        >
          【{{ option.value }}】{{ option.label }}
        </button>
      </div>
      <button class="btn" :disabled="!reunionChoice" @click="submitReunion">确认</button>
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

const currentBlock = computed(() => {
  const textBlocks = {
    0: {
      lines: [`亲爱的${gameState.roomNumber || ''}号住户，欢迎回到2026号公寓。`],
    },
    1: {
      lines: ['这是你的房间。'],
    },
    2: {
      className: 'large-line',
      lines: ['它', '空', '空', '的。'],
    },
    3: {
      lines: [
        '寻人启事正挂在窗边。',
        '一股气流渗透进来，',
        '似是闪电留下的呼吸。',
      ],
    },
    5: {
      lines: [
        '你伸手触摸那张寻人启事，',
        '指尖一麻。',
      ],
      projection: '“你就要走吗？”',
    },
    6: {
      lines: [
        '你听到隔壁传来的人声，',
        '经过墙壁的折叠，',
        '像一段断掉的旧声音。',
      ],
      projection: '“你心里就这么急么？急着要走。你有权利说这种话么？你忘记了在这屋子里，半夜，我哭的时候，你叹息着说的话么？好了，这次算我求你。”',
    },
    7: {
      lines: ['你也想起了一个人。'],
    },
    8: {
      lines: [
        'Ta曾经靠近你，',
        '又毫无征兆地离开了。',
        '什么都没留下。',
        '——你看向那张空桌子。',
      ],
    },
    12: {
      lines: [
        '空气燥热不安。',
        '你听见远处的雷声。',
        '雷暴就要来了。',
      ],
    },
  }
  return textBlocks[gameState.currentPage]
})
const floodInputs = ref(['', '', ''])
const nameInput = ref('')
const departureChoice = ref('')
const reunionChoice = ref('')

const floodPlaceholders = ['写下第一样东西', '写下第二样东西', '写下第三样东西']
const canSubmitFlood = computed(() => floodInputs.value.some(item => item.trim()))

const departureOptions = [
  { value: 'A', label: '抬头仰望' },
  { value: 'B', label: '抱紧自己' },
  { value: 'C', label: '向外探望' },
  { value: 'D', label: '用力跺脚' },
]

const reunionOptions = [
  { value: 'A', label: '盯住ta' },
  { value: 'B', label: '停住' },
  { value: 'C', label: '快速扑向ta' },
  { value: 'D', label: '等待ta靠近' },
]

function submitFlood() {
  const value = floodInputs.value
    .map(item => item.trim())
    .filter(Boolean)
    .join('、')
  if (!value) return
  setAnswer('floodItem', value, { label: value, text: value })
  gameState.currentPage = 5
}

function handleFloodEnter(index, event) {
  const inputs = [...event.currentTarget.closest('.flood-lines').querySelectorAll('input')]
  const nextInput = inputs[index + 1]
  if (nextInput) {
    nextInput.focus()
    return
  }
  submitFlood()
}

function submitName() {
  const value = nameInput.value.trim()
  if (!value) return
  setAnswer('lovedOneName', value, { label: value, text: value })
  gameState.currentPage = 10
}

async function submitDeparture(event) {
  if (!departureChoice.value) return
  const option = departureOptions.find(item => item.value === departureChoice.value)
  setAnswer('departureAction', departureChoice.value, { label: option.label })
  await runChoiceOutro({
    event,
    advance: () => {
      gameState.currentPage = 11
    },
  })
}

async function submitReunion(event) {
  if (!reunionChoice.value) return
  const option = reunionOptions.find(item => item.value === reunionChoice.value)
  setAnswer('reunionAction', reunionChoice.value, { label: option.label })
  await runChoiceOutro({
    event,
    advance: () => {
      gameState.currentPage = 12
    },
  })
}
</script>
