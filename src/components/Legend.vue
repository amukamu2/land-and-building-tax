<script setup lang="ts">
import { CHANGE_COLORS, CHANGE_LABELS, TEST_AREA_COLOR } from '../mapStyle'
import type { ChangeType } from '../data/BuildingChangeSource'

const types: ChangeType[] = ['gone', 'new', 'unknown']
</script>

<template>
  <ul class="legend">
    <!-- Vue: `v-for` ≈ Angular `*ngFor` / `@for`; `:key` ≈ `track`. -->
    <li v-for="type in types" :key="type">
      <span class="dot" :style="{ background: CHANGE_COLORS[type] }"></span>
      {{ CHANGE_LABELS[type] }}
    </li>
    <li>
      <span class="answer-ring"></span>
      Dashed ring = answer key (A… / Q…) · solid dot = model output
    </li>
    <li>
      <span class="added-marker"></span>
      Added after seeing model output
    </li>
    <li>
      <span class="box" :style="{ borderColor: TEST_AREA_COLOR }"></span>
      Test area
    </li>
  </ul>
</template>

<style scoped>
.legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 4px;
  font-size: 13px;
}
li {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1.5px solid #fff;
  box-shadow: 0 0 0 1px #0003;
  flex: none;
}
.answer-ring {
  width: 14px;
  height: 14px;
  flex: none;
  border-radius: 50%;
  background: transparent;
  border: 3px dashed #555;
  box-shadow: none;
}
.added-marker {
  width: 10px;
  height: 10px;
  flex: none;
  border-radius: 50%;
  background: #e87919;
  border: 1px solid white;
}
.box {
  width: 16px;
  height: 12px;
  border: 2px dashed;
  flex: none;
}
</style>
