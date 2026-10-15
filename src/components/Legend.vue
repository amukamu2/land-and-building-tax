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
      <span class="dot ring"></span>
      Ring = answer key (A…) · solid dot = model output (C…)
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
.dot.ring {
  background: transparent;
  border: 3px solid #555;
  box-shadow: none;
}
.box {
  width: 16px;
  height: 12px;
  border: 2px dashed;
  flex: none;
}
</style>
