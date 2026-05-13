<template>
  <div class="page">
    <template v-if="gameState.currentPage === 0">
      <div class="cover-page" aria-label="蘩漪2026封面"></div>
    </template>

    <template v-else-if="gameState.currentPage === 1">
      <p>您好，欢迎来到2026号公寓！</p>
      <p>请输入您的门牌号：</p>
      <input type="text" v-model="roomInput" placeholder="输入门牌号" @keyup.enter="submitRoom" />
      <button class="btn" @click="submitRoom">进入房间</button>
    </template>

    <template v-else-if="gameState.currentPage === 2">
      <p>亲爱的<span class="highlight">{{ gameState.roomNumber }}</span>号住户，您好。</p>
      <p>刚刚在分发寻人启事的女人，或许您曾经见过她。</p>
      <button class="btn" @click="goToPrologue">继续</button>
    </template>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { gameState, setAnswer, goToPhase } from '../../stores/game.js'

const roomInput = ref(gameState.roomNumber || '')

function submitRoom() {
  const value = roomInput.value.trim()
  if (!value) return
  setAnswer('roomNumber', value)
  gameState.currentPage = 2
}

function goToPrologue() {
  goToPhase('prologue')
}
</script>
