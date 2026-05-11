const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

function visible(el) {
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function setWindVars(el, index, strength = 1) {
  const direction = index % 2 === 0 ? 1 : -1
  const x = (36 + Math.random() * 52) * direction * strength
  const y = (-24 - Math.random() * 46) * strength
  const rot = (2 + Math.random() * 5) * direction * strength
  el.style.setProperty('--wind-x', `${x}px`)
  el.style.setProperty('--wind-y', `${y}px`)
  el.style.setProperty('--wind-rot', `${rot}deg`)
  el.style.setProperty('--wind-delay', `${index * 42}ms`)
}

function collectFinalElements(page) {
  const elements = [
    ...page.querySelectorAll('p'),
    ...page.querySelectorAll('.question-label'),
    ...page.querySelectorAll('.choice-btn.selected'),
    ...page.querySelectorAll('.choice-preserve, textarea'),
  ]
  return [...new Set(elements)].filter(visible)
}

function makeParticleLayer() {
  const layer = document.createElement('div')
  layer.className = 'choice-particle-layer'
  document.body.appendChild(layer)
  return layer
}

function makeGlyph(layer, particles, char, rect, style) {
  const fontSize = parseFloat(style.fontSize)
  const lineHeight = style.lineHeight === 'normal' ? `${rect.height}px` : style.lineHeight
  const letterSpacing = style.letterSpacing === 'normal' ? '0px' : style.letterSpacing
  const hue = 30 + Math.random() * 20
  const sat = 42 + Math.random() * 28
  const lit = 66 + Math.random() * 14

  const span = document.createElement('span')
  span.textContent = char
  span.style.cssText = `
    position:fixed;left:${rect.left}px;top:${rect.top}px;
    width:${Math.max(rect.width, 1)}px;height:${Math.max(rect.height, fontSize)}px;
    font:${style.fontStyle} ${style.fontWeight} ${fontSize}px ${style.fontFamily};
    line-height:${lineHeight};letter-spacing:${letterSpacing};
    color:hsl(${hue}, ${sat}%, ${lit}%);
    white-space:pre;text-align:left;font-kerning:normal;
    -webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;
    text-shadow:0 0 8px hsla(${hue}, ${sat}%, ${lit}%, 0.42);
    transform-origin:50% 50%;transform:translate(0,0) rotate(0deg) scale(1);
    opacity:1;pointer-events:none;will-change:transform,opacity;
    display:block;
  `
  layer.appendChild(span)
  particles.push({
    el: span,
    vx: 0,
    vy: 0,
    tx: 0,
    ty: 0,
    rot: 0,
    sc: 1,
    noise: Math.random() * Math.PI * 2,
    elapsed: 0,
    delay: 0,
    life: 1.05 + Math.random() * 0.48,
  })
}

function collectTextGlyphs(root, layer, particles) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let textNode
  while ((textNode = walker.nextNode())) {
    const nodeText = textNode.textContent || ''
    for (let i = 0; i < nodeText.length; i++) {
      if (!nodeText[i].trim()) continue
      const range = document.createRange()
      try {
        range.setStart(textNode, i)
        range.setEnd(textNode, i + 1)
      } catch {
        continue
      }
      const rect = range.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) continue
      const parentEl = textNode.parentElement || root
      makeGlyph(layer, particles, nodeText[i], rect, window.getComputedStyle(parentEl))
    }
  }
}

function collectInputGlyphs(root, layer, particles) {
  const inputs = root.matches?.('input, textarea')
    ? [root]
    : [...root.querySelectorAll('input, textarea')]

  inputs.forEach(input => {
    const text = input.value || ''
    if (!text.trim()) return
    const rect = input.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return

    const style = window.getComputedStyle(input)
    const fontSize = parseFloat(style.fontSize)
    const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.5
    const canvas = collectInputGlyphs.canvas || document.createElement('canvas')
    collectInputGlyphs.canvas = canvas
    const ctx = canvas.getContext('2d')
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${fontSize}px ${style.fontFamily}`

    const chars = [...text]
    const widths = chars.map(char => Math.max(ctx.measureText(char).width, fontSize * 0.56))
    const totalWidth = widths.reduce((sum, width) => sum + width, 0)
    const paddingLeft = Number.parseFloat(style.paddingLeft) || 0
    const paddingRight = Number.parseFloat(style.paddingRight) || 0
    let x = rect.left + paddingLeft

    if (style.textAlign === 'center') {
      x = rect.left + Math.max((rect.width - totalWidth) / 2, paddingLeft)
    } else if (style.textAlign === 'right') {
      x = rect.right - paddingRight - totalWidth
    }

    const top = rect.top + Math.max((rect.height - lineHeight) / 2, 0)
    chars.forEach((char, index) => {
      if (!char.trim()) {
        x += widths[index]
        return
      }
      makeGlyph(layer, particles, char, {
        left: x,
        top,
        width: widths[index],
        height: lineHeight,
      }, style)
      x += widths[index]
    })
  })
}

function scatterGlyphParticles(particles, layer) {
  if (particles.length === 0) {
    layer.remove()
    return Promise.resolve(false)
  }

  const windSide = Math.random() > 0.5 ? 1 : -1
  particles.forEach((particle, index) => {
    const angle = -Math.PI / 2 + windSide * (0.18 + Math.random() * 0.76)
    const speed = 1.2 + Math.random() * 2.35
    particle.vx = Math.cos(angle) * speed + windSide * (0.22 + Math.random() * 0.52)
    particle.vy = Math.sin(angle) * speed - 0.16
    particle.delay = Math.min(index * 0.005, 0.28) + Math.random() * 0.08
  })

  return new Promise(resolve => {
    let previous = null
    let rafId = null
    let finished = false
    const hardStopTimer = setTimeout(finish, 1900)

    function finish() {
      if (finished) return
      finished = true
      if (rafId) cancelAnimationFrame(rafId)
      clearTimeout(hardStopTimer)
      layer.remove()
      resolve(true)
    }

    function tick(timestamp) {
      if (finished) return
      if (!previous) previous = timestamp
      const dt = Math.min((timestamp - previous) / 1000, 0.033)
      previous = timestamp

      let anyAlive = false
      particles.forEach(particle => {
        particle.elapsed += dt
        if (particle.elapsed < particle.delay) {
          anyAlive = true
          return
        }

        const localElapsed = particle.elapsed - particle.delay
        const t = localElapsed / particle.life
        if (t >= 1) return
        anyAlive = true

        const ease = t * t
        const drift = Math.sin(particle.noise + localElapsed * 2) * 0.34
        particle.tx += (particle.vx + drift) * (0.54 + ease * 0.86)
        particle.ty += particle.vy * (0.54 + ease * 0.68)
        particle.vy -= 0.013
        particle.rot += particle.vx * dt * 28 * (1 + ease)
        particle.sc = (1 - ease) * (0.96 + Math.sin(localElapsed * 6) * 0.04)

        const alpha = t < 0.14 ? 1 : Math.pow(1 - (t - 0.14) / 0.86, 1.55)
        particle.el.style.transform = `translate(${particle.tx}px,${particle.ty}px) rotate(${particle.rot}deg) scale(${particle.sc})`
        particle.el.style.opacity = alpha
      })

      if (!anyAlive) {
        finish()
        return
      }
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
  })
}

async function scatterFinalElements(finalElements) {
  const layer = makeParticleLayer()
  const particles = []
  finalElements.forEach(el => {
    collectTextGlyphs(el, layer, particles)
    collectInputGlyphs(el, layer, particles)
  })

  finalElements.forEach(el => el.classList.add('choice-outro-particle-source'))
  finalElements
    .filter(el => el.classList.contains('choice-btn'))
    .forEach(el => el.classList.add('choice-outro-shell-fade'))

  return scatterGlyphParticles(particles, layer)
}

export async function runChoiceOutro({ event, advance }) {
  const source = event?.currentTarget
  const page = source?.closest?.('.page') || document.querySelector('.page')
  if (!page || page.dataset.choiceOutroRunning === 'true') return false

  page.dataset.choiceOutroRunning = 'true'
  page.classList.add('choice-outro-running')

  const selected = [...page.querySelectorAll('.choice-btn.selected')].filter(visible)
  const unselected = [...page.querySelectorAll('.choice-btn:not(.selected)')].filter(visible)
  const finalElements = collectFinalElements(page)
  const confirmButtons = [...page.querySelectorAll('.btn:not(.choice-btn)')].filter(visible)

  confirmButtons.forEach(button => button.classList.add('choice-outro-confirm'))
  selected.forEach(el => el.classList.add('choice-outro-retain'))
  finalElements.forEach(el => el.classList.add('choice-outro-retain'))
  unselected.forEach((el, index) => {
    setWindVars(el, index, 1)
    el.classList.add('choice-outro-away')
  })

  await wait(960)

  unselected.forEach(el => {
    el.style.display = 'none'
  })
  page.classList.add('choice-outro-collapsed')
  selected[0]?.scrollIntoView({ block: 'center', behavior: 'smooth' })

  await wait(820)

  const scattered = await scatterFinalElements(finalElements)
  if (!scattered) {
    finalElements.forEach((el, index) => {
      setWindVars(el, index, 0.72)
      el.classList.add('choice-outro-final')
    })
    await wait(1120)
  }

  window.__fySkipNextPageScatter = true
  advance()
  return true
}
