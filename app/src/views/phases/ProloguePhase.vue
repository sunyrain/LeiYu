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

    <template v-else>
      <div class="waiting-state">
        <p>请静静感受此刻。</p>
        <p class="waiting-sub">等待剧情继续</p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { gameState } from '../../stores/game.js'

const pageBlocks = [
  {
    lines: [
      '她叫蘩漪。蘩为白蒿，漪为柔波。',
      '名字里藏着干涸的根茎；',
      '与不安的涟漪。',
    ],
  },
  {
    lines: [
      '秩序用“疯子”定义她内心的火焰，',
      '但她拒绝平静，也拒绝逃亡。',
      '她站定在深渊中心，在毁灭里索要自由。',
    ],
  },
  {
    className: 'large-line',
    lines: [
      '你听，',
      '命运的雷暴正从她的指尖涌起。',
    ],
  },
  {
    className: 'notice-line',
    lines: [
      '我是 _______ 。',
      '我正在寻找那个曾与我 _______ 的人。',
    ],
  },
  {
    className: 'notice-line',
    lines: [
      '在这间屋子里，',
      '我感到背叛，感到脆弱，',
      '感到 _______ 。',
    ],
  },
  {
    className: 'notice-line',
    lines: [
      'Ta曾在半夜叹息，',
      '却在雷鸣时撤退。',
    ],
  },
  {
    className: 'notice-line',
    lines: [
      'Ta的特征是：得体，清秀，',
      '像一张被反复折叠又抹平的纸，',
      '极其冷漠，',
      '极其 _______ 。',
    ],
  },
  {
    lines: [
      '如果你见过这具空心的躯壳，',
      '请到2026号公寓找我。',
    ],
  },
  {
    lines: [
      '如果你遇到这样的人，',
      '请到2026号公寓找我。',
    ],
  },
]

const currentBlock = computed(() => pageBlocks[gameState.currentPage])
</script>
