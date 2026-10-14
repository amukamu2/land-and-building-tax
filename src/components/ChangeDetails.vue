<script setup lang="ts">
import type { ChangeProps } from '../data/BuildingChangeSource'
import { CHANGE_COLORS, CHANGE_LABELS, KIND_LABELS } from '../mapStyle'

defineProps<{ features: ChangeProps[] }>()

function yesNo(value: boolean | null | undefined): string {
  return value === true ? 'Yes' : value === false ? 'No' : '—'
}

function show(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === '' ? '—' : String(value)
}
</script>

<template>
  <div class="details">
    <p v-if="features.length > 1" class="hint">{{ features.length }} points at this spot</p>
    <article v-for="(f, i) in features" :key="i":style="{ borderLeftColor: CHANGE_COLORS[f.type] }">
      <h3>{{ f.id }} <small>{{ KIND_LABELS[f.kind] }}</small></h3>
      <dl>
        <dt>Type</dt>
        <dd>{{ CHANGE_LABELS[f.type] }} <span class="raw">({{ f.rawType || 'empty' }})</span></dd>
        <dt>Test area</dt>
        <dd>{{ show(f.placeId) }}</dd>
        <dt>Year first seen</dt>
        <dd>{{ show(f.yearFirstSeen) }}</dd>
        <!-- Optional fields: only shown when the source table had the column. -->
        <template v-if="'areaM2' in f">
          <dt>Area</dt>
          <dd>{{ f.areaM2 != null ? `${f.areaM2.toLocaleString()} m²` : '—' }}</dd>
        </template>
        <template v-if="'isLowRise' in f">
          <dt>Low-rise?</dt>
          <dd>{{ yesNo(f.isLowRise) }}</dd>
        </template>
        <template v-if="'addedAfterCode' in f">
          <dt>Added after seeing code?</dt>
          <dd>{{ yesNo(f.addedAfterCode) }}</dd>
        </template>
        <template v-if="'note' in f">
          <dt>Note</dt>
          <dd>{{ show(f.note) }}</dd>
        </template>
      </dl>
    </article>
  </div>
</template>

<style scoped>
.details {
  display: grid;
  gap: 8px;
  font-size: 13px;
}
.hint {
  margin: 0;
  color: #666;
}
article {
  border-left: 5px solid;
  padding: 4px 0 4px 10px;
  background: #f7f7f7;
  border-radius: 4px;
}
h3 {
  margin: 0 0 4px;
  font-size: 15px;
}
small {
  font-weight: normal;
  color: #666;
}
dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 10px;
  margin: 0;
}
dt {
  color: #555;
}
dd {
  margin: 0;
}
.raw {
  color: #888;
}
</style>
