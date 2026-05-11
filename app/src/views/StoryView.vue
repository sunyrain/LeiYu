<template>
  <div
    class="story"
    :class="phaseClass"
    @click="handleClick"
    @touchmove.passive="onTouchMove"
    @mousemove="onMouseMove"
  >
    <div
      v-if="previousStageBg"
      class="stage-bg stage-bg-previous"
      :style="{ backgroundImage: `url('${previousStageBg}')` }"
    ></div>
    <div
      class="stage-bg stage-bg-current"
      :class="{ 'is-fading-in': isStageFading }"
      :style="{ backgroundImage: `url('${activeStageBg}')` }"
    ></div>
    <canvas ref="ambientCanvas" class="ambient-canvas"></canvas>
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
    <div ref="glyphLayer" class="glyph-layer"></div>
    <div v-if="showTapHint && !isScattering" class="tap-hint">轻触继续</div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { gameState, nextPage } from '../stores/game.js'
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

const phaseBackgrounds = {
  entry: '/backgrounds/entry-threshold.webp',
  prologue: '/backgrounds/prologue-notice.webp',
  act1: '/backgrounds/act1-flood-memory.webp',
  act2: '/backgrounds/act2-thunderfire.webp',
  act3: '/backgrounds/act3-room-rebuild.webp',
  act4: '/backgrounds/act4-afterstorm.webp',
}

const activeStageBg = ref(phaseBackgrounds[gameState.currentPhase] || phaseBackgrounds.entry)
const previousStageBg = ref('')
const isStageFading = ref(false)
let stageFadeTimer = null

const preloadedBackgrounds = []

function preloadStageBackgrounds() {
  if (typeof Image === 'undefined' || preloadedBackgrounds.length > 0) return
  Object.values(phaseBackgrounds).forEach(src => {
    const img = new Image()
    img.decoding = 'async'
    img.src = src
    preloadedBackgrounds.push(img)
  })
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
  () => gameState.currentPhase,
  async phase => {
    const nextBg = phaseBackgrounds[phase] || phaseBackgrounds.entry
    if (nextBg === activeStageBg.value) return

    if (stageFadeTimer) clearTimeout(stageFadeTimer)
    previousStageBg.value = activeStageBg.value
    activeStageBg.value = nextBg
    isStageFading.value = false

    await nextTick()
    requestAnimationFrame(() => {
      isStageFading.value = true
    })

    stageFadeTimer = setTimeout(() => {
      previousStageBg.value = ''
      isStageFading.value = false
      stageFadeTimer = null
    }, 1850)
  },
)

const interactivePages = {
  entry: [0, 1],
  prologue: [],
  act1: [4, 9, 10, 11],
  act2: [5, 7],
  act3: [6, 7],
  act4: [2, 3, 4, 5],
}

const terminalPages = {
  act4: 6,
}

const waitingPages = {
  prologue: 9,
  act1: 13,
  act2: 8,
  act3: 8,
}

const isScattering = ref(false)
let skipLeaveScatter = false

const isTerminalPage = computed(() => {
  const terminalPage = terminalPages[gameState.currentPhase]
  return terminalPage !== undefined && gameState.currentPage >= terminalPage
})

const isWaitingPage = computed(() => {
  const waitingPage = waitingPages[gameState.currentPhase]
  return waitingPage !== undefined && gameState.currentPage >= waitingPage
})

const showTapHint = computed(() => {
  if (isTerminalPage.value) return false
  if (isWaitingPage.value) return false
  const pages = interactivePages[gameState.currentPhase] || []
  return !pages.includes(gameState.currentPage)
})

// ── glyph DOM layer ──────────────────────────────────────────────
const glyphLayer = ref(null)
let glyphEls = []
let rafId = null

function collectGlyphs(el) {
  const layer = glyphLayer.value
  if (!layer) return
  layer.innerHTML = ''
  glyphEls = []

  const textEls = el.querySelectorAll('p')
  textEls.forEach(textEl => {
    const text = textEl.textContent || ''
    if (!text.trim()) return

    const style = window.getComputedStyle(textEl)
    const fontSize = parseFloat(style.fontSize)

    const walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT)
    let textNode
    while ((textNode = walker.nextNode())) {
      const nodeText = textNode.textContent || ''
      for (let i = 0; i < nodeText.length; i++) {
        if (!nodeText[i].trim()) continue
        const range = document.createRange()
        try {
          range.setStart(textNode, i)
          range.setEnd(textNode, i + 1)
        } catch { continue }
        const rect = range.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) continue

        const parentEl = textNode.parentElement
        const charStyle = parentEl ? window.getComputedStyle(parentEl) : style
        const charFont = `${charStyle.fontStyle} ${charStyle.fontWeight} ${parseFloat(charStyle.fontSize)}px ${charStyle.fontFamily}`
        const charLineHeight = charStyle.lineHeight === 'normal' ? `${rect.height}px` : charStyle.lineHeight
        const charLetterSpacing = charStyle.letterSpacing === 'normal' ? '0px' : charStyle.letterSpacing

        // Assign a warm color palette per character
        const hue = 30 + Math.random() * 20  // gold range 30-50
        const sat = 40 + Math.random() * 30  // 40-70%
        const lit = 65 + Math.random() * 15  // 65-80%
        const charColor = `hsl(${hue}, ${sat}%, ${lit}%)`

        const span = document.createElement('span')
        span.textContent = nodeText[i]
        span.style.cssText = `
          position:fixed;left:${rect.left}px;top:${rect.top}px;
          width:${rect.width}px;height:${rect.height}px;
          font:${charFont};color:${charColor};
          line-height:${charLineHeight};letter-spacing:${charLetterSpacing};
          white-space:pre;text-align:left;font-kerning:normal;
          -webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;
          text-shadow:0 0 8px hsla(${hue},${sat}%,${lit}%,0.4);
          transform-origin:50% 50%;transform:translate(0,0) rotate(0deg) scale(1);
          opacity:1;pointer-events:none;will-change:transform,opacity;
          display:block;
        `
        layer.appendChild(span)
        glyphEls.push({
          el: span,
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          vx: 0, vy: 0,
          tx: 0, ty: 0, rot: 0, sc: 1,
          noise: Math.random() * Math.PI * 2,
          elapsed: 0,
          delay: 0,
          life: 1.2 + Math.random() * 0.6,
          scattered: false,
        })
      }
    }
  })
}

// Scatter all glyphs randomly (no point needed)
function scatterRandom() {
  const windSide = Math.random() > 0.5 ? 1 : -1
  glyphEls.forEach((g, index) => {
    if (g.scattered) return
    const angle = -Math.PI / 2 + windSide * (0.18 + Math.random() * 0.72)
    const speed = 1.25 + Math.random() * 2.2
    g.vx = Math.cos(angle) * speed + windSide * (0.2 + Math.random() * 0.5)
    g.vy = Math.sin(angle) * speed - 0.18
    g.life = 1.05 + Math.random() * 0.48
    g.delay = Math.min(index * 0.006, 0.26) + Math.random() * 0.08
    g.elapsed = 0
    g.scattered = true
  })
}

function scatterNear(cx, cy) {
  const radius = 80
  glyphEls.forEach(g => {
    if (!g.scattered) return
    const dx = g.x + g.tx - cx
    const dy = g.y + g.ty - cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < radius && dist > 0) {
      const force = (1 - dist / radius) * 4
      g.vx += (dx / dist) * force
      g.vy += (dy / dist) * force - 0.5
    }
  })
}

function startScatterTick(done) {
  if (rafId) cancelAnimationFrame(rafId)
  let prev = null
  let finished = false
  let hardStopTimer = null

  function finish() {
    if (finished) return
    finished = true
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    if (hardStopTimer) clearTimeout(hardStopTimer)
    clearGlyphs()
    isScattering.value = false
    setTimeout(done, 100)
  }

  function tick(ts) {
    if (finished) return
    if (!prev) prev = ts
    const dt = Math.min((ts - prev) / 1000, 0.033)
    prev = ts

    let anyAlive = false

    glyphEls.forEach(g => {
      if (!g.scattered) return
      g.elapsed += dt
      if (g.elapsed < g.delay) {
        anyAlive = true
        return
      }

      const localElapsed = g.elapsed - g.delay
      const t = localElapsed / g.life
      if (t >= 1) return
      anyAlive = true

      const ease = t * t
      const drift = Math.sin(g.noise + localElapsed * 2) * 0.32
      g.tx += (g.vx + drift) * (0.5 + ease * 0.8)
      g.ty += g.vy * (0.5 + ease * 0.6)
      g.vy -= 0.012
      g.rot += g.vx * dt * 25 * (1 + ease)
      g.sc = (1 - ease) * (0.95 + Math.sin(localElapsed * 6) * 0.05)

      const alpha = t < 0.15 ? 1 : Math.pow(1 - (t - 0.15) / 0.85, 1.6)
      g.el.style.transform = `translate(${g.tx}px,${g.ty}px) rotate(${g.rot}deg) scale(${g.sc})`
      g.el.style.opacity = alpha
    })

    if (anyAlive) {
      rafId = requestAnimationFrame(tick)
    } else {
      finish()
    }
  }

  hardStopTimer = setTimeout(finish, 2100)
  rafId = requestAnimationFrame(tick)
}

// ── Vue transition hooks ─────────────────────────────────────────
function onBeforeLeave(el) {
  skipLeaveScatter = Boolean(window.__fySkipNextPageScatter)
  window.__fySkipNextPageScatter = false
  clearGlyphs()
  el.classList.remove('page-entering', 'page-disappearing')
  if (!skipLeaveScatter) collectGlyphs(el)
}

function onLeave(el, done) {
  if (skipLeaveScatter) {
    el.style.opacity = '0'
    setTimeout(() => {
      skipLeaveScatter = false
      done()
    }, 90)
    return
  }

  if (glyphEls.length === 0) {
    el.style.opacity = '0'
    setTimeout(done, 240)
    return
  }

  isScattering.value = true
  el.style.opacity = '0'
  scatterRandom()
  startScatterTick(done)
}

function onAfterLeave() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null }
  isScattering.value = false
  skipLeaveScatter = false
  clearGlyphs()
}

function clearGlyphs() {
  const layer = glyphLayer.value
  if (layer) layer.innerHTML = ''
  glyphEls = []
}

function onEnter(el, done) {
  clearGlyphs()
  el.style.visibility = ''
  el.style.opacity = ''
  el.style.transform = ''
  el.style.filter = ''
  el.classList.remove('page-disappearing')
  el.classList.add('page-entering')

  setTimeout(() => {
    el.classList.remove('page-entering')
    done()
  }, 760)
}

// ── interaction ──────────────────────────────────────────────────
function handleClick(e) {
  if (e.target.closest('input, textarea, button, .choices, .choice-btn, .btn')) return

  if (isTerminalPage.value) return
  if (isWaitingPage.value) return
  if (document.querySelector('.page .choices, .page input, .page textarea, .page .btn')) return

  const pages = interactivePages[gameState.currentPhase] || []
  if (pages.includes(gameState.currentPage)) return

  nextPage()
}

function onTouchMove(e) {
  if (!isScattering.value) return
  const t = e.touches[0]
  if (t) scatterNear(t.clientX, t.clientY)
}

function onMouseMove(e) {
  if (!isScattering.value) return
  scatterNear(e.clientX, e.clientY)
}

// ── flowing ambient projection ───────────────────────────────────
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
  initAmbient()
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

.glyph-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 100;
}

.ambient-canvas {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  opacity: 0.92;
  mix-blend-mode: screen;
}

.phase-storm .ambient-canvas {
  opacity: 1;
}
</style>
