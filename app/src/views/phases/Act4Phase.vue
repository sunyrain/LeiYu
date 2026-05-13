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
      <p>里面是____</p>
      <div class="choices">
        <button
          v-for="option in mirrorOptions"
          :key="option.value"
          class="choice-btn"
          :class="{ selected: mirrorChoice === option.value }"
          @click="mirrorChoice = option.value"
        >
          {{ option.label }}
        </button>
      </div>
      <button class="btn" :disabled="!mirrorChoice" @click="submitMirror">确认</button>
    </template>

    <template v-else-if="gameState.currentPage === 3">
      <p>你再次看见那个名字。</p>
      <p class="highlight">{{ gameState.lovedOneName || '那个名字' }}</p>
      <p>它正在变成____。</p>
      <div class="choices">
        <button
          v-for="option in transformOptions"
          :key="option.value"
          class="choice-btn"
          :class="{ selected: transformChoice === option.value }"
          @click="transformChoice = option.value"
        >
          {{ option.label }}
        </button>
      </div>
      <button class="btn" :disabled="!transformChoice" @click="submitTransform">确认</button>
    </template>

    <template v-else-if="gameState.currentPage === 4">
      <p>{{ items.join('、') }}亮晶晶的，</p>
      <p>你____</p>
      <div class="choices">
        <button
          v-for="option in objectOptions"
          :key="option.value"
          class="choice-btn"
          :class="{ selected: objectChoice === option.value }"
          @click="objectChoice = option.value"
        >
          {{ option.label }}
        </button>
      </div>
      <button class="btn" :disabled="!objectChoice" @click="submitObject">确认</button>
    </template>

    <template v-else-if="gameState.currentPage === 5">
      <p>你____。</p>
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
            {{ option.label }}
          </button>
          <label
            v-else
            class="choice-btn choice-btn-input"
            :class="{ selected: finalChoice === option.value }"
            @click="selectFinal(option.value)"
          >
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

    <template v-else-if="gameState.currentPage >= 6">
      <div class="save-state">
        <div class="poem-poster" aria-label="我的拼贴诗">
          <div class="poster-kicker">{{ gameState.roomNumber || '2026' }}号房间</div>
          <div class="poster-title">我的拼贴诗</div>
          <div class="poster-lines">
            <p v-for="(line, index) in posterLines" :key="index">{{ line }}</p>
          </div>
          <div class="poster-footer">
            <span>雷雨 · 2026</span>
            <span>{{ gameState.lovedOneName || '那个名字' }}</span>
          </div>
        </div>
        <button class="btn save-btn" @click="savePosterImage">保存图片</button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { gameState, setAnswer } from '../../stores/game.js'

const mirrorChoice = ref(gameState.mirrorSelf || '')
const transformChoice = ref(gameState.finalTransform || '')
const objectChoice = ref(gameState.objectAction || '')
const finalChoice = ref(readFinalChoice())
const customFinal = ref(readCustomFinal())

const posterLines = computed(() => {
  const lines = String(gameState.roomBase || '')
    .split(/\r?\n|(?=让)|(?=再把)/)
    .map(line => line.trim())
    .filter(Boolean)

  if (lines.length) return lines.slice(0, 6)
  return [
    `让${items.value[0]}成为地面，`,
    `让${items.value[1]}挡住外面的水，`,
    `让${items.value[2]}盖在头顶，`,
    `再把${gameState.lovedOneName || '那个名字'}放在你的身边。`,
  ]
})

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

function readFinalChoice() {
  if (!gameState.finalAction) return ''
  if (['A', 'B', 'C'].includes(gameState.finalAction)) return gameState.finalAction
  return 'D'
}

function readCustomFinal() {
  if (!gameState.finalAction) return ''
  if (['A', 'B', 'C'].includes(gameState.finalAction)) return ''
  return gameState.finalAction
}

const canSubmitFinal = computed(() => {
  if (!finalChoice.value) return false
  if (finalChoice.value !== 'D') return true
  return Boolean(customFinal.value.trim())
})

function selectFinal(value) {
  finalChoice.value = value
}

function submitMirror() {
  if (!mirrorChoice.value) return
  const option = mirrorOptions.find(item => item.value === mirrorChoice.value)
  setAnswer('mirrorSelf', mirrorChoice.value, { label: option.label })
  gameState.currentPage = 3
}

function submitTransform() {
  if (!transformChoice.value) return
  const option = transformOptions.find(item => item.value === transformChoice.value)
  setAnswer('finalTransform', transformChoice.value, { label: option.label })
  gameState.currentPage = 4
}

function submitObject() {
  if (!objectChoice.value) return
  const option = objectOptions.find(item => item.value === objectChoice.value)
  setAnswer('objectAction', objectChoice.value, { label: option.label })
  gameState.currentPage = 5
}

function submitFinal() {
  if (!canSubmitFinal.value) return
  const option = finalOptions.find(item => item.value === finalChoice.value)
  const label = finalChoice.value === 'D' ? customFinal.value.trim() : option.label
  const value = finalChoice.value === 'D' ? label : finalChoice.value
  setAnswer('finalAction', value, { label, text: label })
  gameState.currentPage = 6
}

async function savePosterImage() {
  const canvas = document.createElement('canvas')
  const width = 1080
  const height = 1440
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  drawPosterBackground(ctx, width, height)
  drawPosterText(ctx, width, height)

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!blob) return
  const fileName = `2026-room-${gameState.roomNumber || 'poem'}.png`

  if (navigator.canShare && navigator.share) {
    const file = new File([blob], fileName, { type: 'image/png' })
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: '我的拼贴诗' })
        return
      } catch {}
    }
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function drawPosterBackground(ctx, width, height) {
  const bg = ctx.createLinearGradient(0, 0, 0, height)
  bg.addColorStop(0, '#17120f')
  bg.addColorStop(0.54, '#080607')
  bg.addColorStop(1, '#110806')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)

  const glow = ctx.createRadialGradient(width * 0.66, height * 0.72, 0, width * 0.66, height * 0.72, width * 0.72)
  glow.addColorStop(0, 'rgba(238, 140, 42, 0.22)')
  glow.addColorStop(0.42, 'rgba(238, 140, 42, 0.08)')
  glow.addColorStop(1, 'rgba(238, 140, 42, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = 'rgba(232, 196, 126, 0.28)'
  ctx.lineWidth = 2
  ctx.strokeRect(72, 72, width - 144, height - 144)

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 42; i++) {
    const x = 84 + i * 22
    const h = 120 + Math.sin(i * 0.73) * 54 + Math.random() * 72
    const flame = ctx.createLinearGradient(x, height - 92, x, height - 92 - h)
    flame.addColorStop(0, 'rgba(255, 120, 34, 0.62)')
    flame.addColorStop(0.42, 'rgba(255, 190, 94, 0.22)')
    flame.addColorStop(1, 'rgba(255, 224, 156, 0)')
    ctx.fillStyle = flame
    ctx.fillRect(x, height - 92 - h, 13, h)
  }
  ctx.restore()
}

function drawPosterText(ctx, width, height) {
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = 'rgba(232, 196, 126, 0.72)'
  ctx.font = '32px GenRyuMinTW, serif'
  ctx.fillText(`${gameState.roomNumber || '2026'}号房间`, 112, 128)

  ctx.fillStyle = '#f0eadf'
  ctx.font = '68px GenRyuMinTW, serif'
  ctx.fillText('我的拼贴诗', 112, 190)

  ctx.fillStyle = 'rgba(238, 230, 214, 0.9)'
  ctx.font = '42px GenRyuMinTW, serif'
  let y = 360
  posterLines.value.forEach(line => {
    const wrapped = wrapCanvasText(ctx, line, width - 224)
    wrapped.forEach(part => {
      ctx.fillText(part, 112, y)
      y += 74
    })
    y += 20
  })

  ctx.fillStyle = 'rgba(232, 196, 126, 0.58)'
  ctx.font = '28px GenRyuMinTW, serif'
  ctx.fillText('雷雨 · 2026', 112, height - 180)

  ctx.textAlign = 'right'
  ctx.fillText(gameState.lovedOneName || '那个名字', width - 112, height - 180)
}

function wrapCanvasText(ctx, text, maxWidth) {
  const chars = [...String(text || '')]
  const lines = []
  let current = ''
  chars.forEach(char => {
    const next = current + char
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current)
      current = char
      return
    }
    current = next
  })
  if (current) lines.push(current)
  return lines
}
</script>

<style scoped>
.save-state {
  width: min(100%, 380px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  position: relative;
  z-index: 4;
}

.poem-poster {
  width: min(100%, 330px);
  aspect-ratio: 3 / 4;
  display: flex;
  flex-direction: column;
  padding: 24px 22px;
  border: 1px solid rgba(232, 196, 126, 0.28);
  background:
    linear-gradient(180deg, rgba(23, 18, 15, 0.94), rgba(8, 6, 7, 0.96) 58%, rgba(17, 8, 6, 0.96)),
    radial-gradient(circle at 68% 78%, rgba(238, 140, 42, 0.18), transparent 52%);
  box-shadow: 0 0 34px rgba(255, 139, 38, 0.11), inset 0 0 38px rgba(255, 202, 128, 0.035);
  text-align: left;
}

.poster-kicker {
  color: rgba(232, 196, 126, 0.62);
  font-size: 13px;
  line-height: 1.2;
}

.poster-title {
  margin-top: 10px;
  color: #f0eadf;
  font-size: 26px;
  line-height: 1.2;
}

.poster-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
  margin: 18px 0;
}

.poster-lines p {
  width: 100%;
  max-width: none;
  margin: 0;
  color: rgba(238, 230, 214, 0.88);
  font-size: 17px;
  line-height: 1.72;
  text-align: left;
  opacity: 1;
  animation: none;
}

.poster-footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: rgba(232, 196, 126, 0.48);
  font-size: 12px;
  line-height: 1.2;
}

.save-btn {
  margin-top: 0;
}
</style>
