# 背景图提示词系统

用途：观众端 9:16 手机网页背景。六张图不是单独插画，而是一组随剧情推进的舞台空间：入口静默 -> 寻人启事唤醒 -> 水与记忆上升 -> 雷暴/火焰爆发 -> 房间重建 -> 雨后余光。

## 系列规范

通用生成约束：
- Use case: stylized-concept
- Asset type: 9:16 portrait mobile web stage background
- Style: cinematic theatrical concept art, literary, dark, premium stage projection quality
- Scene language: near-black old apartment interior, wet wall/glass texture, reflective black floor, smoky air, subtle film grain
- Color system: black, deep umber, restrained amber/gold fire-light, rare cold rain highlights
- Layout: keep the central 45% vertically readable for thin Chinese serif text; strongest light should stay on lower third or side edges
- Continuity: every phase should feel like the same room at a different emotional pressure, not a new location
- Avoid: text, readable letters, people, faces, bodies, logos, watermark, UI controls, stock photography, bright clean interior, horror gore, literal clipart lightning

叠加建议：
- 网页端再叠一层黑色纵向渐变和轻微边缘暗角，保证文字在明暗背景上都稳定。
- 动态只做低频光脉冲、微尘、雨线，不做高频闪烁，避免字体与背景一起闪。
- 每张图都保留足够暗区，不要让生成模型把视觉焦点堆在正中央。

## 01 entry-threshold

Prompt:

```text
Use case: stylized-concept
Asset type: 9:16 portrait mobile web stage background
Primary request: ENTRY background for "蘩漪的2026号房间"; the audience arrives at a dark old apartment threshold before the storm begins.
Scene/backdrop: an old apartment doorway and deep corridor barely visible in darkness; faint amber light leaks from the lower right and the door edge; wet floor reflection, dust motes in still air.
Composition/framing: portrait, deep central negative space for Chinese serif text, doorway and wall details pushed to edges and lower third.
Lighting/mood: hushed, intimate, suspenseful, ritual entrance, pre-thunder stillness.
Constraints: no text, no people, no faces, no logos, center must stay dark and readable.
Avoid: bright flames, obvious lightning bolts, horror imagery, cluttered center.
```

Project asset: `app/public/backgrounds/entry-threshold.png`

## 02 prologue-notice

Prompt:

```text
Use case: stylized-concept
Asset type: 9:16 portrait mobile web stage background
Primary request: PROLOGUE background for "蘩漪的2026号房间"; a missing-person notice and a memory begin to breathe.
Scene/backdrop: dark apartment wall and window-like surface; traces of pasted paper and torn notice texture without readable writing; faint rain streaks on glass; a low amber pulse begins near the floor.
Composition/framing: portrait, central text-safe darkness, torn paper texture only at side edges.
Lighting/mood: searching, uneasy, intimate, memory surfacing.
Constraints: no readable letters, no people, no faces, no UI, no watermark.
Avoid: literal newspaper headline, bright flames, obvious lightning bolts.
```

Project asset: `app/public/backgrounds/prologue-notice.png`

## 03 act1-flood-memory

Prompt:

```text
Use case: stylized-concept
Asset type: 9:16 portrait mobile web stage background
Primary request: ACT 1 background for "蘩漪的2026号房间"; flood, memory, fragile objects, and the first emotional pull.
Scene/backdrop: the same dark room half-submerged in reflective black water; soft amber ripples and faint floating object silhouettes suggested abstractly; rain streaks on glass; a low fire-like waveform reflected in water.
Composition/framing: portrait, reflective water along lower third, side-window details, central negative space kept readable.
Lighting/mood: tender, submerged, intimate, memory-heavy, quiet before rupture.
Constraints: no text, no human body, no literal disaster scene, no watermark.
Avoid: flood rescue imagery, floating bodies, horror, bright flames filling the center.
```

Project asset: `app/public/backgrounds/act1-flood-memory.png`

## 04 act2-thunderfire

Prompt:

```text
Use case: stylized-concept
Asset type: 9:16 portrait mobile web stage background
Primary request: ACT 2 background for "蘩漪的2026号房间"; thunderstorm erupts from the body, fire, revolt, rupture, and a self-made epitaph.
Scene/backdrop: abstract vertical thunder-fire waveform intensifies along the lower third and right edge, like flame, sound wave, torn velvet, and rain smashed together; old room walls dissolve into smoke and hot rain.
Composition/framing: portrait, maximum energy on lower third and side edges, central text area remains dark with high contrast.
Lighting/mood: intense, charged, violent but elegant, liberating, ritualistic, cathartic.
Constraints: no text, no people, no faces, no logos, no watermark, center must remain readable.
Avoid: literal explosion, realistic fire consuming the center, horror, lightning-bolt clipart.
```

Project asset: `app/public/backgrounds/act2-thunderfire.png`

## 05 act3-room-rebuild

Prompt:

```text
Use case: stylized-concept
Asset type: 9:16 portrait mobile web stage background
Primary request: ACT 3 background for "蘩漪的2026号房间"; after rupture, the audience rebuilds a new room from memory, objects, shelter, and language fragments.
Scene/backdrop: the dark room re-forming from warm luminous fragments; abstract floor-plan lines, soft rectangles of shelter, floating dust and small object-like silhouettes without literal detail; the fire waveform calms into horizontal amber threads near the lower third.
Composition/framing: portrait, stable central text-safe darkness, construction fragments kept subtle around edges and floor.
Lighting/mood: healing, constructive, intimate, tender, reflective, slightly surreal.
Constraints: no readable text, no furniture catalogue look, no people, no logos, no watermark.
Avoid: bright clean room, stock interior, literal blueprint labels.
```

Project asset: `app/public/backgrounds/act3-room-rebuild.png`

## 06 act4-afterstorm

Prompt:

```text
Use case: stylized-concept
Asset type: 9:16 portrait mobile web stage background
Primary request: ACT 4 / ending background for "蘩漪的2026号房间"; after the thunderstorm, the room is quiet, transformed, and open to the next breath.
Scene/backdrop: the storm has passed; same dark room with wet reflective floor, faint open doorway or window glow, embers cooled into soft gold dust, rain trails fading; an afterimage of the fire waveform dissolves into calm horizontal light.
Composition/framing: portrait, gentle light from side or lower third, generous central text-safe darkness.
Lighting/mood: quiet, tender, relieved, unresolved but peaceful; aftermath, breath, time, continuation.
Constraints: no text, no people, no faces, no logos, no watermark.
Avoid: bright sunrise, happy stock image, literal rainbow, horror.
```

Project asset: `app/public/backgrounds/act4-afterstorm.png`
