<template>
  <div class="page prologue-page">
    <div class="prologue-reader">
      <div
        ref="scrollRef"
        class="prologue-scroll"
        @scroll.passive="scheduleHighlight"
        @wheel.prevent="handleWheel"
      >
        <div class="prologue-spacer" aria-hidden="true"></div>
        <p
          v-for="(line, index) in prologueLines"
          :key="index"
          :ref="el => setLineRef(el, index)"
          :class="lineClass(index)"
        >
          {{ line }}
        </p>
        <div class="prologue-spacer" aria-hidden="true"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const prologueLines = [
  '你看到一个素面又阴鸷的女人，如光透过层层褶皱。',
  '她叫蘩漪。蘩为白蒿，常生于水畔；而漪正为水之柔波，似润泽自我。',
  '可这水面下是深刻的曲折。若叶心过于坚涩枯槁，那静美的植物根茎将会吸噬水波，直至干涸；而若是水纹常铺陈晃动，一株原向上生长的白蒿或被牵动重心，一头沉入无尽的阴郁。',
  '命运从不贪恋平坦，而要在这曲折的褶皱中逐渐涌起死生的大荒流。',
  '文弱，偏执，混乱，疯癫，执掌所谓秩序的弱者希图用一纸诊断断送她的奇特，而从未看穿她内心真正的火。',
  '她偏不平静，不纵容虚伪的堂皇绞杀生命突围的怒火；她又偏不狂奔，不自我流放为边缘又荒唐的角色，而要站定在这屋内，在这深渊暗涌的最中心将所有力与美穿透，直至最真亦最恒久的大欢喜以可怖的骄傲倾泻而来：那是直面毁灭后的自由，那是孕育性的穿孔，那是呼唤万象的汹涌。',
  '你听，她正在这暗涌的临界点轻抚自己的额头。指尖萧瑟下，一场命运的雷暴正胎心波动。',
]

const scrollRef = ref(null)
const activeCenter = ref(0)
const lineRefs = []
let rafId = 0

function setLineRef(el, index) {
  if (el) lineRefs[index] = el
}

function lineClass(index) {
  const distance = Math.abs(index - activeCenter.value)
  return {
    'is-core': distance === 0,
    'is-edge': distance === 1,
  }
}

let wheelLocked = false
let wheelTimer = null

function scheduleHighlight() {
  if (rafId) return
  rafId = requestAnimationFrame(() => {
    rafId = 0
    updateHighlight()
  })
}

function updateHighlight() {
  const scroller = scrollRef.value
  if (!scroller) return

  const center = scroller.scrollTop + scroller.clientHeight / 2
  let closestIndex = 0
  let closestDistance = Number.POSITIVE_INFINITY

  lineRefs.forEach((line, index) => {
    if (!line) return
    const lineCenter = line.offsetTop + line.offsetHeight / 2
    const distance = Math.abs(lineCenter - center)
    if (distance < closestDistance) {
      closestDistance = distance
      closestIndex = index
    }
  })

  activeCenter.value = closestIndex
}

function handleWheel(event) {
  if (wheelLocked || !event.deltaY) return
  const direction = event.deltaY > 0 ? 1 : -1
  const nextIndex = Math.min(Math.max(activeCenter.value + direction, 0), prologueLines.length - 1)
  scrollToLine(nextIndex)
  wheelLocked = true
  if (wheelTimer) clearTimeout(wheelTimer)
  wheelTimer = setTimeout(() => {
    wheelLocked = false
  }, 260)
}

function scrollToLine(index) {
  const scroller = scrollRef.value
  const line = lineRefs[index]
  if (!scroller || !line) return
  const top = line.offsetTop + line.offsetHeight / 2 - scroller.clientHeight / 2
  scroller.scrollTo({ top, behavior: 'smooth' })
  activeCenter.value = index
}

onMounted(async () => {
  await nextTick()
  updateHighlight()
  window.addEventListener('resize', scheduleHighlight)
})

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId)
  if (wheelTimer) clearTimeout(wheelTimer)
  window.removeEventListener('resize', scheduleHighlight)
})
</script>

<style scoped>
.prologue-page {
  justify-content: center;
  align-items: center;
  padding-top: calc(76px + env(safe-area-inset-top));
  padding-bottom: calc(56px + env(safe-area-inset-bottom));
  overflow: hidden;
  touch-action: pan-y;
}

.prologue-reader {
  width: min(100%, 440px);
  height: min(74vh, 600px);
  position: relative;
  z-index: 4;
  isolation: isolate;
  overflow: hidden;
  touch-action: pan-y;
}

.prologue-scroll {
  height: 100%;
  width: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior-x: none;
  overscroll-behavior-y: contain;
  touch-action: pan-y;
  scroll-snap-type: y mandatory;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  position: relative;
  z-index: 2;
}

.prologue-scroll::-webkit-scrollbar {
  display: none;
}

.prologue-spacer {
  height: calc(50% - 22px);
  min-height: 150px;
}

.prologue-scroll p {
  width: 100%;
  max-width: none;
  min-height: 88px;
  margin: 0 0 12px;
  padding: 0 8px;
  display: block;
  text-align: left;
  font-size: 22px;
  line-height: 1.88;
  color: rgba(238, 230, 214, 0.2);
  opacity: 0.55;
  animation: none;
  text-shadow: none;
  overflow-wrap: anywhere;
  word-break: normal;
  scroll-snap-align: center;
  scroll-snap-stop: always;
  transform-origin: left center;
  transition: color 0.22s ease, opacity 0.22s ease, transform 0.22s ease, text-shadow 0.22s ease;
}

.prologue-scroll p.is-edge {
  color: rgba(238, 230, 214, 0.48);
  opacity: 0.82;
}

.prologue-scroll p.is-core {
  color: rgba(246, 235, 215, 0.94);
  opacity: 1;
  transform: scale(1.012);
  text-shadow: 0 0 16px rgba(255, 174, 66, 0.16), 0 1px 14px rgba(0, 0, 0, 0.56);
}

.prologue-scroll p.is-core:nth-child(odd) {
  color: rgba(255, 226, 170, 0.96);
}

@media (max-height: 740px) {
  .prologue-page {
    padding-top: calc(68px + env(safe-area-inset-top));
    padding-bottom: calc(44px + env(safe-area-inset-bottom));
  }

  .prologue-reader {
    height: min(74vh, 500px);
  }

  .prologue-scroll p {
    font-size: 20px;
    min-height: 78px;
    line-height: 1.78;
    margin-bottom: 10px;
  }
}
</style>
