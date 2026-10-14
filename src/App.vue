<script setup lang="ts">
import { computed, ref, shallowRef, useTemplateRef } from 'vue'
import MapView from './components/MapView.vue'
import FileUpload from './components/FileUpload.vue'
import Legend from './components/Legend.vue'
import LoadReportView from './components/LoadReportView.vue'
import ChangeDetails from './components/ChangeDetails.vue'
import { useBuildingChanges } from './composables/useBuildingChanges'
import { CsvSource } from './data/CsvSource'
import type { ChangeCollection, ChangeProps, ChangeType, RowKind } from './data/BuildingChangeSource'
import { CHANGE_LABELS, KIND_LABELS } from './mapStyle'

const { changes, testAreas, changesReport, testAreasReport, loadChanges, loadTestAreas, clear } =
  useBuildingChanges()

const mapView = useTemplateRef<InstanceType<typeof MapView>>('mapView')
const selected = shallowRef<ChangeProps[]>([])
const satellite = ref(false)
const selectedAreaId = ref('')

async function onChangeFiles(files: File[]) {
  const label = files.map((f) => f.name).join(' + ')
  if (await loadChanges(new CsvSource({ changes: files }), label)) mapView.value?.fitToChanges()
}

async function onAreaFile([file]: File[]) {
  if (file) await loadTestAreas(new CsvSource({ testAreas: file }), file.name)
  selectedAreaId.value = ''
}

function clearData() {
  clear()
  selectedAreaId.value = ''
  year.value = 'all'
}

function zoomToArea() {
  if (selectedAreaId.value) mapView.value?.fitToArea(selectedAreaId.value)
}

// --- Filters ---
const allTypes: ChangeType[] = ['gone', 'new', 'unknown']
const allKinds: RowKind[] = ['code', 'answer', 'other']
const shownTypes = ref<ChangeType[]>([...allTypes])
const shownKinds = ref<RowKind[]>([...allKinds])
const year = ref<number | 'all'>('all')

const years = computed(() =>
  [...new Set(changes.value.features.map((f) => f.properties.yearFirstSeen))]
    .filter((y): y is number => y !== null)
    .sort((a, b) => a - b),
)
// Only offer the "Rows" filter when the data actually mixes answer key and code rows.
const kindsPresent = computed(() => allKinds.filter((k) => changes.value.features.some((f) => f.properties.kind === k)))

const filteredChanges = computed<ChangeCollection>(() => ({
  type: 'FeatureCollection',
  features: changes.value.features.filter(
    ({ properties: p }) =>
      shownTypes.value.includes(p.type) &&
      shownKinds.value.includes(p.kind) &&
      (year.value === 'all' || p.yearFirstSeen === year.value),
  ),
}))
</script>

<template>
  <div class="layout">
    <aside>
      <h1>Building Change Map</h1>
      <p class="sub">Prototype · Bangkok · upload CSVs to start</p>

      <section>
        <h2>Data</h2>
        <!-- Vue: `@files="…"` listens to the child's emitted event, like Angular `(files)="…"`. -->
        <FileUpload label="Change points (code output / answer key)" multiple @files="onChangeFiles" />
        <LoadReportView v-if="changesReport" :report="changesReport" />
        <FileUpload label="Test areas" @files="onAreaFile" />
        <LoadReportView v-if="testAreasReport" :report="testAreasReport" />
        <button
          type="button"
          :disabled="!changes.features.length && !testAreas.features.length && !changesReport && !testAreasReport"
          @click="clearData"
        >
          Clear all data
        </button>
      </section>

      <section>
        <h2>View</h2>
        <label class="row">
          Test area
          <!-- Vue: `v-model` ≈ Angular `[(ngModel)]` two-way binding. -->
          <select v-model="selectedAreaId" @change="zoomToArea">
            <option value="">— zoom to… —</option>
            <option v-for="a in testAreas.features" :key="a.properties.id" :value="a.properties.id">
              {{ a.properties.id }} · {{ a.properties.name }}
            </option>
          </select>
        </label>
        <label class="row"><input v-model="satellite" type="checkbox" /> Satellite imagery</label>
      </section>

      <section>
        <h2>Filter</h2>
        <div class="row wrap">
          <label v-for="t in allTypes" :key="t">
            <input v-model="shownTypes" type="checkbox" :value="t" /> {{ CHANGE_LABELS[t] }}
          </label>
        </div>
        <div v-if="kindsPresent.length > 1" class="row wrap">
          <label v-for="k in kindsPresent" :key="k">
            <input v-model="shownKinds" type="checkbox" :value="k" /> {{ KIND_LABELS[k] }}
          </label>
        </div>
        <label class="row">
          Year first seen
          <select v-model="year">
            <option value="all">All years</option>
            <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
          </select>
        </label>
        <p class="sub">Showing {{ filteredChanges.features.length }} of {{ changes.features.length }} points</p>
      </section>

      <section>
        <h2>Legend</h2>
        <Legend />
      </section>

      <section>
        <h2>Selected</h2>
        <ChangeDetails v-if="selected.length" :features="selected" />
        <p v-else class="sub">Click a point on the map.</p>
      </section>
    </aside>

    <main>
      <MapView
        ref="mapView"
        :changes="filteredChanges"
        :test-areas="testAreas"
        :satellite="satellite"
        @select="selected = $event"
      />
    </main>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  height: 100vh;
}
aside {
  width: 340px;
  flex: none;
  overflow-y: auto;
  padding: 12px 16px;
  border-right: 1px solid #ddd;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
main {
  flex: 1;
  min-width: 0;
}
h1 {
  margin: 0;
  font-size: 18px;
}
h2 {
  margin: 0 0 6px;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #555;
}
section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sub {
  margin: 0;
  font-size: 12px;
  color: #666;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.row.wrap {
  flex-wrap: wrap;
  gap: 4px 12px;
}
select {
  flex: 1;
  min-width: 0;
}
button {
  align-self: flex-start;
}

@media (max-width: 700px) {
  .layout {
    flex-direction: column-reverse;
  }
  aside {
    width: auto;
    height: 45vh;
    border-right: none;
    border-top: 1px solid #ddd;
  }
}
</style>
