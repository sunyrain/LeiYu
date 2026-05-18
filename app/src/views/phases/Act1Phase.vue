<template>
  <div class="page front-page">
    <template v-if="gameState.currentPage === 0">
      <div class="waiting-state">
        <p>请抬头，看向房间。</p>
      </div>
    </template>

    <template v-else-if="gameState.currentPage === 1">
      <div class="front-panel name-panel">
        <p>这是你藏在心底的寻人启事。</p>
        <p>如果可以，</p>
        <p>你想叫出此时心头那个呼之欲出却又只能努力吞咽的名字</p>
        <p class="hint-line">如我的白月光，我的灵魂伴侣，我的最强拍档，我的生活搭子，总是出现在我梦里的人，我几乎要忘掉的人</p>
        <input
          type="text"
          v-model="nameInput"
          class="line-input"
          placeholder="写下那个名字"
          @keyup.enter="submitName"
        />
        <button class="btn" :disabled="!nameInput.trim()" @click="submitName">确认</button>
      </div>
    </template>

    <template v-else-if="gameState.currentPage === 2">
      <div class="waiting-state">
        <p>请抬头，看向房间。</p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { gameState, setAnswer } from '../../stores/game.js'

const nameInput = ref(gameState.lovedOneName || '')

function submitName() {
  const value = nameInput.value.trim()
  if (!value) return
  setAnswer('lovedOneName', value, { label: value, text: value })
  gameState.currentPage = 2
}
</script>

<style scoped>
.front-panel {
  width: min(100%, 430px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.name-panel p {
  margin-bottom: 4px;
}
</style>
