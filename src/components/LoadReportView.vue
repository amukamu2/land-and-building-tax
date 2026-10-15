<script setup lang="ts">
import { computed } from 'vue'
import type { LoadReport } from '../composables/useBuildingChanges'

const props = defineProps<{ report: LoadReport }>()

// Angular: `computed` ≈ a computed signal: cached, recalculated when `props.report` changes.
const skipped = computed(() => props.report.issues.filter((i) => i.severity === 'skipped'))
const warnings = computed(() => props.report.issues.filter((i) => i.severity === 'warning'))
</script>

<template>
  <div class="report">
    <!-- Vue: `v-if` / `v-else` ≈ Angular `*ngIf` / `@if … @else`. -->
    <p v-if="report.error" class="error">⚠ Could not load data: {{ report.error }}</p>
    <template v-else>
      <p>
        <strong>{{ report.label }}</strong>: {{ report.loadedCount }} of {{ report.rowCount }} rows loaded
        <span v-if="skipped.length" class="bad">· {{ skipped.length }} skipped</span>
        <span v-if="warnings.length" class="warn">· {{ warnings.length }} warning(s)</span>
      </p>
      <details v-if="report.issues.length" :open="skipped.length > 0">
        <summary>View row details</summary>
        <ul>
          <li v-for="(issue, i) in report.issues" :key="i" :class="issue.severity === 'skipped' ? 'bad' : 'warn'">
            {{ issue.file }} · line {{ issue.line }}<template v-if="issue.id"> ({{ issue.id }})</template>
            — {{ issue.severity === 'skipped' ? 'skipped' : 'warning' }}: {{ issue.message }}
          </li>
        </ul>
      </details>
    </template>
  </div>
</template>

<style scoped>
.report {
  font-size: 13px;
}
p {
  margin: 0;
}
ul {
  margin: 4px 0 0;
  padding-left: 18px;
}
.error {
  color: #a83d32;
}
.bad {
  color: #a83d32;
}
.warn {
  color: #8a6500;
}
</style>
