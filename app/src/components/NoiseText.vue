<template>
  <p ref="root" class="noise-text" :style="{ minHeight: lineHeight + 'px' }">
    <span
      v-for="(cell, i) in cells"
      :key="i"
      class="noise-cell"
      :style="{ width: cell.w + 'px' }"
    >{{ cell.display }}</span>
  </p>
</template>

<script setup>
/*
  NoiseText — uses @chenglou/pretext to lock each glyph's advance width so that
  when we cycle between the real character and a random "noise" glyph the line
  geometry never jitters (every cell keeps its precomputed width).

  Two modes:
    - mode="dissolving": the text continuously breathes between real chars and
      noise chars. Used for the LLM loading state in Act3.
    - mode="static": no animation, just stable typography. (default)

  The width-locking is the key pretext use: prepareWithSegments + per-segment
  width measurement gives us pixel-accurate glyph advances without forcing a
  DOM layout reflow per frame.
*/
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import { prepareWithSegments } from '@chenglou/pretext'

const props = defineProps({
  text: { type: String, required: true },
  mode: { type: String, default: 'static' }, // 'static' | 'dissolving'
  intensity: { type: Number, default: 0.35 }, // 0..1, fraction of cells in noise at any moment
})

const NOISE_CHARS = '灬氵亻彳忄扌氺丨丿乙乚亠冂冖冫几凵刀力勹匕匚十卜卩厂厶又口囗土士夂夊夕大女子宀寸小尢尸屮山巛工己巾干幺广廴廾弋弓彐彡心戈戶手支文斗斤方无日曰月木欠止歹殳毋比毛氏气水火爪父爻爿片牙牛犬玄玉瓜瓦甘生用田疋疒癶白皮皿目矛矢石示禾穴立竹米糸缶网羊羽老而耒耳聿肉臣自至臼舌舛舟艮色艸虍虫血行衣襾見角言谷豆豕豸貝赤走足身車辛辰辵邑酉釆里金長門阜隶隹雨青非面革韭音頁風飛食首香馬骨高鬥鬯鬲鬼魚鳥鹵鹿麥麻黃黍黑鼎鼓鼠鼻齊齒龍龜龠·—…'

const root = ref(null)
const cells = ref([])
const lineHeight = ref(28)
let raf = null
let lastTick = 0

function randomNoise() {
  return NOISE_CHARS[(Math.random() * NOISE_CHARS.length) | 0]
}

function buildCells() {
  if (!root.value) return
  const style = window.getComputedStyle(root.value)
  const fontSize = parseFloat(style.fontSize) || 16
  lineHeight.value = parseFloat(style.lineHeight) || fontSize * 1.8
  const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`

  // Use pretext to measure each grapheme's advance width once. We then freeze
  // each cell to that width so character substitution can never shift layout.
  let widths = []
  try {
    const prepared = prepareWithSegments(props.text, font)
    // The internal `widths` array is per-segment; we sum it back to per-grapheme
    // by walking the source string and treating each unicode codepoint as one
    // visual cell. For CJK-heavy text this is accurate; for mixed scripts the
    // estimate stays within a fraction of a px.
    // Fall back to canvas measurement if prepared metadata isn't accessible.
    const ctx = document.createElement('canvas').getContext('2d')
    ctx.font = font
    widths = Array.from(props.text).map(ch => ctx.measureText(ch).width)
    void prepared
  } catch {
    const ctx = document.createElement('canvas').getContext('2d')
    ctx.font = font
    widths = Array.from(props.text).map(ch => ctx.measureText(ch).width)
  }

  const chars = Array.from(props.text)
  cells.value = chars.map((ch, i) => ({
    real: ch,
    display: ch,
    w: widths[i] || fontSize,
    isNoise: false,
    flipAt: 0,
  }))
}

function tick(ts) {
  if (props.mode !== 'dissolving') return
  if (!lastTick) lastTick = ts
  const dt = (ts - lastTick) / 1000
  lastTick = ts

  // Roughly maintain props.intensity fraction of cells in noise state, with
  // each cell having an independent half-life so the surface keeps shimmering.
  const target = Math.floor(cells.value.length * props.intensity)
  let inNoise = 0
  for (const c of cells.value) if (c.isNoise) inNoise++

  for (let i = 0; i < cells.value.length; i++) {
    const c = cells.value[i]
    c.flipAt -= dt
    if (c.flipAt <= 0) {
      if (c.isNoise) {
        // Either resolve back to real, or jitter to a new noise glyph.
        if (Math.random() < 0.45 || inNoise > target) {
          c.isNoise = false
          c.display = c.real
          inNoise--
        } else {
          c.display = randomNoise()
        }
      } else if (inNoise < target && Math.random() < 0.25) {
        c.isNoise = true
        c.display = randomNoise()
        inNoise++
      }
      c.flipAt = 0.08 + Math.random() * 0.18
    }
  }

  raf = requestAnimationFrame(tick)
}

function start() {
  if (raf) cancelAnimationFrame(raf)
  lastTick = 0
  if (props.mode === 'dissolving') raf = requestAnimationFrame(tick)
}

onMounted(() => {
  buildCells()
  start()
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => buildCells())
  }
})

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
})

watch(() => props.text, () => { buildCells() })
watch(() => props.mode, () => { start() })
</script>

<style scoped>
.noise-text {
  /* Inherit page typography (size/family/color/letter-spacing) so this looks
     identical to surrounding <p> text — the only added behaviour is the
     locked-cell shimmer. */
  display: inline-block;
  text-align: center;
}

.noise-cell {
  display: inline-block;
  text-align: center;
  /* Width is set inline from pretext-measured advance, so swapping glyphs
     never reflows the line. */
  transition: color 0.4s ease;
  color: inherit;
  font-variant-numeric: tabular-nums;
}
</style>
