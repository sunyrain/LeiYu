<template>
  <div
    class="story"
    :class="[phaseClass, { 'is-bg-empty': !activeStageBg }]"
    @click="handleClick"
  >
    <div
      v-if="previousStageBg"
      class="stage-bg stage-bg-previous"
      :style="{ backgroundImage: `url('${previousStageBg}')` }"
    ></div>
    <div
      v-if="activeStageBg"
      class="stage-bg stage-bg-current"
      :class="{ 'is-fading-in': isStageFading }"
      :style="{ backgroundImage: `url('${activeStageBg}')` }"
    ></div>
    <div class="story-hud">
      <div class="story-progress" aria-live="polite">
        <div class="story-progress-meta">
          <span>{{ phaseLabels[gameState.currentPhase] }} {{ currentPhasePage }} / {{ currentPhaseTotal }}</span>
          <span>总页码 {{ currentTotalPage }} / {{ totalPageCount }}</span>
        </div>
        <div class="phase-progress-track" aria-hidden="true">
          <div class="phase-progress-fill" :style="{ width: `${phaseProgressPercent}%` }"></div>
        </div>
      </div>
    </div>
    <button
      v-if="showBackButton"
      type="button"
      class="story-back"
      aria-label="返回上一页"
      @click.stop="goBack"
    >
      返回
    </button>
    <Transition
      @before-leave="onBeforeLeave"
      @leave="onLeave"
      @after-leave="onAfterLeave"
      @enter="onEnter"
      :css="false"
      mode="out-in"
    >
      <component :is="currentComponent" :key="gameState.currentPhase + '-' + gameState.currentPage" />
    </Transition>
    <div v-if="showTapHint && !isPageTransitioning" class="tap-hint">轻触继续</div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { gameState, nextPage, previousPage } from '../stores/game.js'
import EntryPhase from './phases/EntryPhase.vue'
import ProloguePhase from './phases/ProloguePhase.vue'
import Act1Phase from './phases/Act1Phase.vue'
import Act2Phase from './phases/Act2Phase.vue'
import Act3Phase from './phases/Act3Phase.vue'
import Act4Phase from './phases/Act4Phase.vue'

const phaseComponents = {
  entry: EntryPhase,
  prologue: ProloguePhase,
  act1: Act1Phase,
  act2: Act2Phase,
  act3: Act3Phase,
  act4: Act4Phase,
}

const currentComponent = computed(() => phaseComponents[gameState.currentPhase])

const phaseLabels = {
  entry: '进场',
  prologue: '序章',
  act1: '交互一',
  act2: '交互二',
  act3: '交互三',
  act4: '交互四',
}

const phaseOrder = ['entry', 'prologue', 'act1', 'act2', 'act3', 'act4']
const phasePageCounts = {
  entry: 3,
  prologue: 1,
  act1: 14,
  act2: 9,
  act3: 9,
  act4: 7,
}

const totalPageCount = Object.values(phasePageCounts).reduce((sum, count) => sum + count, 0)

const currentPhaseTotal = computed(() => phasePageCounts[gameState.currentPhase] || 1)
const currentPhasePage = computed(() => clampPage(gameState.currentPage + 1, currentPhaseTotal.value))
const currentTotalPage = computed(() => {
  const offset = phaseOrder
    .slice(0, Math.max(0, phaseOrder.indexOf(gameState.currentPhase)))
    .reduce((sum, phase) => sum + (phasePageCounts[phase] || 0), 0)
  return clampPage(offset + currentPhasePage.value, totalPageCount)
})
const phaseProgressPercent = computed(() => {
  return Math.round((currentPhasePage.value / currentPhaseTotal.value) * 100)
})
const showBackButton = computed(() => gameState.currentPage > 0)
const canGoBack = computed(() => showBackButton.value && !isPageTransitioning.value)

function clampPage(page, total) {
  return Math.min(Math.max(page, 1), Math.max(total, 1))
}

const backgroundVersion = '20260512-cover'

const pageBackgrounds = {
  entry: [
    pageBackgroundPath('entry-cover'),
    pageBackgroundPath('entry-0'),
    pageBackgroundPath('entry-1'),
  ],
  prologue: [
    pageBackgroundPath('prologue-0'),
  ],
  act1: pageBackgroundRange('act1', 14),
  act2: pageBackgroundRange('act2', 9),
  act3: pageBackgroundRange('act3', 9),
  act4: [
    ...pageBackgroundRange('act4', 6),
    '',
  ],
}

function pageBackgroundPath(name) {
  return `/backgrounds/pages/${name}.jpg?v=${backgroundVersion}`
}

function pageBackgroundRange(prefix, count) {
  return Array.from({ length: count }, (_, index) => pageBackgroundPath(`${prefix}-${index}`))
}

function getStageBackground(phase = gameState.currentPhase, page = gameState.currentPage) {
  const backgrounds = pageBackgrounds[phase]
  if (!backgrounds) return ''
  if (backgrounds[page] !== undefined) return backgrounds[page]
  return backgrounds[Math.max(0, backgrounds.length - 1)] || ''
}

const activeStageBg = ref(getStageBackground())
const previousStageBg = ref('')
const isStageFading = ref(false)
let stageFadeTimer = null

const preloadedBackgrounds = new Map()

function preloadStageBackgrounds() {
  preloadNearbyBackgrounds()
}

function preloadNearbyBackgrounds(phase = gameState.currentPhase, page = gameState.currentPage) {
  preloadStageBackground(getStageBackground(phase, page))
  const nextPosition = getNextStagePosition(phase, page)
  if (nextPosition) {
    preloadStageBackground(getStageBackground(nextPosition.phase, nextPosition.page))
  }
}

function getNextStagePosition(phase, page) {
  const phaseTotal = phasePageCounts[phase] || 0
  if (page + 1 < phaseTotal) return { phase, page: page + 1 }

  const nextPhase = phaseOrder[phaseOrder.indexOf(phase) + 1]
  if (!nextPhase) return null
  return { phase: nextPhase, page: 0 }
}

function preloadStageBackground(src) {
  if (!src || typeof Image === 'undefined' || preloadedBackgrounds.has(src)) return
  const img = new Image()
  img.decoding = 'async'
  img.src = src
  preloadedBackgrounds.set(src, img)

  if (preloadedBackgrounds.size > 8) {
    const oldestSrc = preloadedBackgrounds.keys().next().value
    preloadedBackgrounds.delete(oldestSrc)
  }
}

const phaseIntensity = {
  entry: 'quiet',
  prologue: 'searching',
  act1: 'flood',
  act2: 'storm',
  act3: 'rebuild',
  act4: 'afterstorm',
}

const phaseClass = computed(() => `phase-${phaseIntensity[gameState.currentPhase] || 'quiet'}`)

watch(
  () => [gameState.currentPhase, gameState.currentPage],
  async ([phase, page]) => {
    const nextBg = getStageBackground(phase, page)
    if (nextBg === activeStageBg.value) return

    if (stageFadeTimer) clearTimeout(stageFadeTimer)
    previousStageBg.value = activeStageBg.value
    activeStageBg.value = nextBg
    isStageFading.value = false

    await nextTick()
    requestAnimationFrame(() => {
      isStageFading.value = true
    })
    preloadNearbyBackgrounds(phase, page)

    stageFadeTimer = setTimeout(() => {
      previousStageBg.value = ''
      isStageFading.value = false
      stageFadeTimer = null
    }, 1850)
  },
)

const interactivePages = {
  entry: [1, 2],
  prologue: [],
  act1: [4, 9, 10, 11],
  act2: [5, 7],
  act3: [6, 7],
  act4: [2, 3, 4, 5],
}

const terminalPages = {
  act4: 6,
}

const controlledPausePages = {
  prologue: [0],
  act1: [5, 6, 13],
  act2: [3, 5, 8],
  act3: [3, 8],
}

const isPageTransitioning = ref(false)
let pageTransitionId = 0

const isTerminalPage = computed(() => {
  const terminalPage = terminalPages[gameState.currentPhase]
  return terminalPage !== undefined && gameState.currentPage >= terminalPage
})

const isWaitingPage = computed(() => {
  const pages = controlledPausePages[gameState.currentPhase] || []
  const lastPage = Math.max((phasePageCounts[gameState.currentPhase] || 1) - 1, 0)
  return pages.includes(gameState.currentPage) || (gameState.currentPage >= lastPage && pages.includes(lastPage))
})

const showTapHint = computed(() => {
  if (isTerminalPage.value) return false
  if (isWaitingPage.value) return false
  const pages = interactivePages[gameState.currentPhase] || []
  return !pages.includes(gameState.currentPage)
})

// ── Vue transition hooks ─────────────────────────────────────────
function onBeforeLeave(el) {
  pageTransitionId += 1
  isPageTransitioning.value = true
  el.style.opacity = ''
  el.style.transform = ''
  el.style.filter = ''
  el.classList.remove('page-entering', 'page-disappearing')
}

function onLeave(el, done) {
  el.classList.add('page-disappearing')
  setTimeout(() => {
    done()
  }, 280)
}

function onAfterLeave() {}

function onEnter(el, done) {
  const transitionId = pageTransitionId
  isPageTransitioning.value = true
  el.style.visibility = ''
  el.style.opacity = ''
  el.style.transform = ''
  el.style.filter = ''
  el.classList.remove('page-disappearing')
  el.classList.add('page-entering')

  setTimeout(() => {
    el.classList.remove('page-entering')
    if (transitionId === pageTransitionId) {
      isPageTransitioning.value = false
    }
    done()
  }, 360)
}

// ── interaction ──────────────────────────────────────────────────
function handleClick(e) {
  if (isPageTransitioning.value) return
  if (e.target.closest('input, textarea, button, .choices, .choice-btn, .btn')) return

  if (isTerminalPage.value) return
  if (isWaitingPage.value) return
  if (document.querySelector('.page .choices, .page input, .page textarea, .page .btn')) return

  const pages = interactivePages[gameState.currentPhase] || []
  if (pages.includes(gameState.currentPage)) return

  nextPage()
}

function goBack() {
  if (!canGoBack.value) return
  previousPage()
}

const ambientCanvas = ref(null)
let ambientParticles = []
let ambientRaf = null
let ambientResizeHandler = null
let ambientSize = { w: 0, h: 0, dpr: 1 }

const ambientProfiles = {
  entry: { count: 30, particleAlpha: 0.7, flowAlpha: 0.14, speed: 0.24, lift: 0.42, wind: 0.08, strands: 4, amp: 5, band: 46, floor: 0.78, curtains: 2 },
  prologue: { count: 44, particleAlpha: 0.84, flowAlpha: 0.2, speed: 0.32, lift: 0.52, wind: 0.1, strands: 5, amp: 7, band: 56, floor: 0.76, curtains: 4 },
  act1: { count: 58, particleAlpha: 0.86, flowAlpha: 0.25, speed: 0.34, lift: 0.38, wind: 0.09, strands: 7, amp: 8, band: 66, floor: 0.8, curtains: 4 },
  act2: { count: 92, particleAlpha: 1, flowAlpha: 0.54, speed: 0.72, lift: 0.78, wind: 0.18, strands: 13, amp: 15, band: 116, floor: 0.73, curtains: 12 },
  act3: { count: 56, particleAlpha: 0.82, flowAlpha: 0.22, speed: 0.3, lift: 0.46, wind: 0.08, strands: 6, amp: 6, band: 58, floor: 0.78, curtains: 3 },
  act4: { count: 42, particleAlpha: 0.76, flowAlpha: 0.16, speed: 0.22, lift: 0.34, wind: 0.05, strands: 4, amp: 4, band: 42, floor: 0.78, curtains: 2 },
}

function currentAmbientProfile() {
  return ambientProfiles[gameState.currentPhase] || ambientProfiles.entry
}

function seedAmbientParticles() {
  const w = Math.max(window.innerWidth, 1)
  const h = Math.max(window.innerHeight, 1)
  ambientParticles = Array.from({ length: 96 }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    size: 0.55 + Math.random() * 1.9,
    vx: (Math.random() - 0.5) * 0.12,
    vy: -0.08 - Math.random() * 0.26,
    alpha: 0.04 + Math.random() * 0.12,
    phase: Math.random() * Math.PI * 2,
    hue: 30 + Math.random() * 18,
    depth: 0.45 + Math.random() * 0.9,
  }))
}

function resizeAmbient() {
  const canvas = ambientCanvas.value
  if (!canvas) return null

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = Math.max(window.innerWidth, 1)
  const h = Math.max(window.innerHeight, 1)
  if (ambientSize.w === w && ambientSize.h === h && ambientSize.dpr === dpr) {
    return canvas.getContext('2d')
  }

  ambientSize = { w, h, dpr }
  canvas.width = Math.floor(w * dpr)
  canvas.height = Math.floor(h * dpr)
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`

  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}

function drawFlowStrands(ctx, w, h, time, profile) {
  const baseY = h * profile.floor
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'

  for (let i = 0; i < profile.strands; i++) {
    const lane = profile.strands === 1 ? 0 : i / (profile.strands - 1)
    const yBase = baseY + (lane - 0.5) * profile.band
    const alpha = profile.flowAlpha * (0.42 + lane * 0.58)
    const gradient = ctx.createLinearGradient(0, yBase, w, yBase)
    gradient.addColorStop(0, `rgba(255, 180, 72, ${alpha * 0.08})`)
    gradient.addColorStop(0.42, `rgba(255, 198, 98, ${alpha * 0.38})`)
    gradient.addColorStop(0.78, `rgba(255, 132, 38, ${alpha * 0.62})`)
    gradient.addColorStop(1, `rgba(255, 216, 130, ${alpha * 0.12})`)

    ctx.beginPath()
    for (let x = -40; x <= w + 40; x += 16) {
      const waveA = Math.sin(x * 0.017 + time * profile.speed * 1.8 + i * 0.84)
      const waveB = Math.sin(x * 0.044 - time * profile.speed * 1.15 + i * 1.7)
      const y = yBase + waveA * profile.amp + waveB * profile.amp * 0.36
      if (x === -40) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.strokeStyle = gradient
    ctx.lineWidth = 0.65 + lane * 1.55
    ctx.shadowColor = `rgba(255, 156, 52, ${alpha * 0.55})`
    ctx.shadowBlur = 10 + lane * 10
    ctx.stroke()
  }

  ctx.restore()
}

function drawLightCurtains(ctx, w, h, time, profile) {
  if (!profile.curtains) return

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'

  for (let i = 0; i < profile.curtains; i++) {
    const lane = i / Math.max(profile.curtains - 1, 1)
    const x = w * (0.06 + lane * 0.92) + Math.sin(time * 0.22 + i * 1.8) * 18
    const len = h * (0.16 + (i % 3) * 0.04)
    const y = ((time * 42 * profile.speed + i * 96) % (h + len * 2)) - len
    const alpha = profile.flowAlpha * (0.12 + (i % 4) * 0.025)
    const gradient = ctx.createLinearGradient(x, y, x, y + len)
    gradient.addColorStop(0, 'rgba(255, 206, 120, 0)')
    gradient.addColorStop(0.5, `rgba(255, 180, 72, ${alpha})`)
    gradient.addColorStop(1, 'rgba(255, 206, 120, 0)')

    ctx.strokeStyle = gradient
    ctx.lineWidth = 0.5 + (i % 3) * 0.4
    ctx.shadowColor = `rgba(255, 160, 56, ${alpha})`
    ctx.shadowBlur = 9
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.sin(time * 0.4 + i) * 6, y + len)
    ctx.stroke()
  }

  ctx.restore()
}

function drawAmbientParticles(ctx, w, h, time, profile) {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'

  ambientParticles.forEach((p, index) => {
    if (index >= profile.count) return

    const flow = Math.sin(p.y * 0.012 + time * profile.speed + p.phase)
    const cross = Math.sin(p.x * 0.01 - time * 0.28 + p.phase)
    p.x += p.vx + flow * profile.wind * p.depth
    p.y += p.vy * profile.lift - cross * 0.025

    if (p.y < -24 || p.x < -36 || p.x > w + 36) {
      p.x = Math.random() * w
      p.y = h + 24 + Math.random() * h * 0.12
    }

    const slowPulse = 0.74 + Math.sin(time * 0.56 + p.phase) * 0.26
    const alpha = p.alpha * profile.particleAlpha * slowPulse
    const radius = p.size * (4.2 + p.depth * 2.4)
    const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius)
    gradient.addColorStop(0, `hsla(${p.hue}, 82%, 72%, ${alpha})`)
    gradient.addColorStop(0.42, `hsla(${p.hue}, 78%, 58%, ${alpha * 0.22})`)
    gradient.addColorStop(1, `hsla(${p.hue}, 72%, 44%, 0)`)
    ctx.fillStyle = gradient
    ctx.fillRect(p.x - radius, p.y - radius, radius * 2, radius * 2)
  })

  ctx.restore()
}

function drawLowerBreath(ctx, w, h, time, profile) {
  const y = h * (0.8 + Math.sin(time * 0.18) * 0.025)
  const x = w * (0.58 + Math.sin(time * 0.14) * 0.12)
  const radius = Math.max(w, h) * 0.36
  const alpha = profile.flowAlpha * 0.22
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
  gradient.addColorStop(0, `rgba(255, 142, 42, ${alpha})`)
  gradient.addColorStop(0.34, `rgba(255, 190, 92, ${alpha * 0.18})`)
  gradient.addColorStop(1, 'rgba(255, 142, 42, 0)')
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
}

function initAmbient() {
  const canvas = ambientCanvas.value
  if (!canvas) return
  seedAmbientParticles()
  resizeAmbient()

  function draw() {
    const ctx = resizeAmbient()
    if (!ctx) return

    const { w, h } = ambientSize
    const time = performance.now() / 1000
    const profile = currentAmbientProfile()

    ctx.clearRect(0, 0, w, h)
    drawLowerBreath(ctx, w, h, time, profile)
    drawFlowStrands(ctx, w, h, time, profile)
    drawLightCurtains(ctx, w, h, time, profile)
    drawAmbientParticles(ctx, w, h, time, profile)

    ambientRaf = requestAnimationFrame(draw)
  }

  ambientResizeHandler = () => {
    resizeAmbient()
  }
  window.addEventListener('resize', ambientResizeHandler, { passive: true })
  draw()
}

onMounted(() => {
  preloadStageBackgrounds()
})

onUnmounted(() => {
  if (ambientRaf) cancelAnimationFrame(ambientRaf)
  if (ambientResizeHandler) window.removeEventListener('resize', ambientResizeHandler)
  if (stageFadeTimer) clearTimeout(stageFadeTimer)
})
</script>

<style scoped>
.story {
  height: 100%;
  width: 100%;
  position: relative;
  overflow: hidden;
  touch-action: manipulation;
  background: #030203;
  --stage-opacity: 0.92;
}

.story.is-bg-empty {
  background: #000;
}

.story-hud {
  position: fixed;
  top: calc(14px + env(safe-area-inset-top));
  left: 18px;
  right: 18px;
  z-index: 6;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  pointer-events: none;
}

.story-back {
  position: fixed;
  left: 18px;
  bottom: calc(20px + env(safe-area-inset-bottom));
  z-index: 7;
  min-width: 58px;
  min-height: 34px;
  border: 1px solid rgba(220, 178, 104, 0.24);
  border-radius: 18px;
  background: rgba(7, 5, 5, 0.48);
  color: rgba(238, 230, 214, 0.72);
  font: inherit;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  backdrop-filter: blur(8px);
  pointer-events: auto;
}

.story-back:active {
  border-color: rgba(238, 207, 146, 0.7);
  color: #f0c979;
  background: rgba(220, 178, 104, 0.12);
}

.story-progress {
  min-width: 0;
  pointer-events: none;
}

.story-progress-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  color: rgba(238, 230, 214, 0.48);
  font-size: 11px;
  line-height: 1.2;
  text-shadow: 0 1px 10px rgba(0, 0, 0, 0.5);
}

.story-progress-meta span {
  min-width: 0;
  white-space: nowrap;
}

.phase-progress-track {
  height: 2px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(238, 230, 214, 0.12);
}

.phase-progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, rgba(224, 190, 122, 0.48), rgba(246, 215, 153, 0.92));
  box-shadow: 0 0 12px rgba(255, 168, 64, 0.28);
  transition: width 0.36s ease;
}

.stage-bg {
  position: fixed;
  inset: 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  transform: scale(1.02);
  opacity: var(--stage-opacity);
  pointer-events: none;
  z-index: 0;
  will-change: opacity, transform, filter;
}

.stage-bg-previous {
  animation: stageBgPreviousFade 1.85s ease forwards;
}

.stage-bg-current.is-fading-in {
  animation: stageBgCurrentFade 1.85s cubic-bezier(0.22, 0.72, 0.18, 1) forwards;
}

@keyframes stageBgPreviousFade {
  from {
    opacity: var(--stage-opacity);
    transform: scale(1.02);
    filter: blur(0);
  }
  to {
    opacity: 0;
    transform: scale(1.035);
    filter: blur(7px);
  }
}

@keyframes stageBgCurrentFade {
  from {
    opacity: 0;
    transform: scale(1.045);
    filter: blur(8px);
  }
  to {
    opacity: var(--stage-opacity);
    transform: scale(1.02);
    filter: blur(0);
  }
}

.story::after {
  content: '';
  position: fixed;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0.08) 45%, rgba(0, 0, 0, 0.5) 100%),
    radial-gradient(ellipse at 50% 42%, transparent 0%, transparent 42%, rgba(0, 0, 0, 0.48) 100%),
    linear-gradient(90deg, rgba(0, 0, 0, 0.52), transparent 28%, transparent 72%, rgba(0, 0, 0, 0.36));
  pointer-events: none;
  z-index: 2;
}

.phase-quiet::after,
.phase-searching::after {
  background:
    linear-gradient(180deg, rgba(0, 0, 0, 0.64) 0%, rgba(0, 0, 0, 0.12) 48%, rgba(0, 0, 0, 0.58) 100%),
    radial-gradient(ellipse at 50% 42%, transparent 0%, transparent 38%, rgba(0, 0, 0, 0.56) 100%);
}

.phase-storm::after {
  background:
    linear-gradient(180deg, rgba(0, 0, 0, 0.46) 0%, rgba(0, 0, 0, 0.04) 44%, rgba(0, 0, 0, 0.34) 100%),
    radial-gradient(ellipse at 50% 35%, rgba(0, 0, 0, 0.12) 0%, rgba(0, 0, 0, 0.18) 42%, rgba(0, 0, 0, 0.46) 100%);
}

.phase-afterstorm {
  --stage-opacity: 0.86;
}

</style>
