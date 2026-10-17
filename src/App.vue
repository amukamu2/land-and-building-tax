<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import MapView, { type MapInset } from './components/MapView.vue'
import FileUpload from './components/FileUpload.vue'
import Legend from './components/Legend.vue'
import LoadReportView from './components/LoadReportView.vue'
import Chevron from './components/Chevron.vue'
import SelectMenu, { type SelectOption } from './components/SelectMenu.vue'
import { useBuildingChanges } from './composables/useBuildingChanges'
import { CsvSource } from './data/CsvSource'
import type { ChangeCollection, ChangeType, RowKind } from './data/BuildingChangeSource'
import { CHANGE_LABELS, KIND_LABELS } from './mapStyle'

const { changes, testAreas, changesReport, testAreasReport, loadChanges, loadTestAreas, clear } =
  useBuildingChanges()

const mapView = useTemplateRef<InstanceType<typeof MapView>>('mapView')
const sidebar = useTemplateRef<HTMLElement>('sidebar')
const satellite = ref(false)
const sidebarOpen = ref(true)
const selectedAreaId = ref('')

async function onChangeFiles(files: File[]) {
  const label = files.map((f) => f.name).join(' + ')
  if (await loadChanges(new CsvSource({ changes: files }), label)) mapView.value?.fitToChanges(panelInset())
}

// The panel floats over the map, so zooming to fit must leave room for whatever it covers:
// its width on the left (desktop) or its height along the bottom (phone bottom sheet).
function panelInset(): MapInset {
  const rect = sidebar.value?.getBoundingClientRect()
  if (!rect) return {}
  return rect.top > 0 ? { bottom: window.innerHeight - rect.top } : { left: rect.right }
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
  if (selectedAreaId.value) mapView.value?.fitToArea(selectedAreaId.value, panelInset())
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
const yearOptions = computed<SelectOption<number | 'all'>[]>(() => [
  { value: 'all', label: 'All years' },
  ...years.value.map((y) => ({ value: y, label: String(y) })),
])
const areaOptions = computed<SelectOption<string>[]>(() => [
  { value: '', label: testAreas.value.features.length ? 'Select an area to zoom to' : 'Import an area CSV to enable' },
  ...testAreas.value.features.map(({ properties: a }) => ({ value: a.id, label: `${a.id} · ${a.name}` })),
])
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
    <aside ref="sidebar" class="sidebar" :class="{ collapsed: !sidebarOpen }">
      <button
        class="panel-toggle"
        type="button"
        aria-controls="sidebar-content"
        :aria-expanded="sidebarOpen"
        :title="sidebarOpen ? 'Hide panel' : 'Show panel'"
        @click="sidebarOpen = !sidebarOpen"
      >
        <Chevron />
        <span class="visually-hidden">{{ sidebarOpen ? 'Hide panel' : 'Show panel' }}</span>
      </button>

      <div id="sidebar-content" class="sidebar-content">
        <header class="app-header">
          <div class="brand-mark" aria-hidden="true">↗</div>
          <div class="brand-copy">
            <h1>Building Change Map</h1>
            <p class="subtitle">Building changes across Bangkok</p>
          </div>
        </header>

        <div class="data-status" :class="{ 'is-empty': !changes.features.length }" role="status">
          <span class="status-dot" aria-hidden="true"></span>
          <span>{{ changes.features.length ? 'Data ready' : 'Waiting for CSV data' }}</span>
          <span class="status-count">{{ changes.features.length.toLocaleString() }} points</span>
        </div>

        <section class="panel-section upload-section" aria-labelledby="upload-title">
          <div class="section-heading">
            <div>
              <span class="eyebrow">GET STARTED</span>
              <h2 id="upload-title">Import data</h2>
            </div>
            <button
              class="text-button"
              type="button"
              :disabled="!changes.features.length && !testAreas.features.length && !changesReport && !testAreasReport"
              @click="clearData"
            >
              Clear data
            </button>
          </div>

          <div class="upload-card">
            <!-- Vue: `@files="…"` listens to the child's emitted event, like Angular `(files)="…"`. -->
            <div class="primary-upload">
              <FileUpload label="Import change points (CSV)" multiple @files="onChangeFiles" />
            </div>
            <LoadReportView v-if="changesReport" :report="changesReport" />
            <div class="upload-divider" aria-hidden="true"><span>AND</span></div>
            <FileUpload label="Test areas (CSV)" @files="onAreaFile" />
            <LoadReportView v-if="testAreasReport" :report="testAreasReport" />
          </div>
        </section>

        <section class="summary-grid" aria-label="Map data summary">
          <article class="summary-card summary-total">
            <span class="summary-label">Total points</span>
            <strong>{{ changes.features.length.toLocaleString() }}</strong>
          </article>
          <article class="summary-card">
            <span class="summary-label"><i class="marker-dot gone"></i>Buildings removed</span>
            <strong>{{ changes.features.filter((f) => f.properties.type === 'gone').length.toLocaleString() }}</strong>
          </article>
          <article class="summary-card">
            <span class="summary-label"><i class="marker-dot new"></i>New buildings</span>
            <strong>{{ changes.features.filter((f) => f.properties.type === 'new').length.toLocaleString() }}</strong>
          </article>
          <article class="summary-card">
            <span class="summary-label"><i class="area-mark"></i>Test areas</span>
            <strong>{{ testAreas.features.length.toLocaleString() }}</strong>
          </article>
        </section>

        <section class="panel-section filter-section" aria-labelledby="filter-title">
          <div class="section-heading">
            <div>
              <span class="eyebrow">EXPLORE DATA</span>
              <h2 id="filter-title">Map filters</h2>
            </div>
            <span class="result-count">{{ filteredChanges.features.length }} / {{ changes.features.length }} points</span>
          </div>

          <label class="field-label" for="area-select">Zoom to test area</label>
          <!-- Vue: `v-model` ≈ Angular `[(ngModel)]` two-way binding. -->
          <SelectMenu
            id="area-select"
            v-model="selectedAreaId"
            :options="areaOptions"
            :disabled="!testAreas.features.length"
            @change="zoomToArea"
          />

          <label class="field-label" for="year-select">Year first seen</label>
          <SelectMenu id="year-select" v-model="year" :options="yearOptions" />

          <span class="field-label type-label">Change type</span>
          <div class="filter-chips" role="group" aria-label="Change type">
            <label v-for="t in allTypes" :key="t" class="filter-chip" :class="`chip-${t}`">
              <input v-model="shownTypes" type="checkbox" :value="t" />
              <span class="chip-dot" aria-hidden="true"></span>
              {{ CHANGE_LABELS[t] }}
            </label>
          </div>

          <details v-if="kindsPresent.length > 1" class="advanced-filter">
            <summary class="disclosure">Data source<Chevron /></summary>
            <div class="filter-chips source-chips">
              <label v-for="k in kindsPresent" :key="k" class="filter-chip">
                <input v-model="shownKinds" type="checkbox" :value="k" />
                {{ KIND_LABELS[k] }}
              </label>
            </div>
          </details>

          <label class="imagery-toggle">
            <span class="toggle-copy"><span class="toggle-icon" aria-hidden="true">▧</span>Satellite imagery</span>
            <input v-model="satellite" type="checkbox" />
            <span class="switch" aria-hidden="true"></span>
          </label>
        </section>

        <details class="legend-section">
          <summary class="disclosure">Map legend<Chevron /></summary>
          <Legend />
        </details>

      </div>
    </aside>

    <main class="map-panel">
      <MapView
        ref="mapView"
        :changes="filteredChanges"
        :test-areas="testAreas"
        :satellite="satellite"
        :get-inset="panelInset"
      />
      <div class="map-result-pill" role="status">
        <span class="status-dot" aria-hidden="true"></span>
        Showing {{ filteredChanges.features.length.toLocaleString() }} of {{ changes.features.length.toLocaleString() }} points
      </div>
    </main>
  </div>
</template>

<style scoped>
.layout {
  /* How much of the map the panel covers, so map controls can sit beside it. */
  --panel-left: 376px;
  --panel-bottom: 0px;
  position: relative;
  height: 100dvh;
  overflow: hidden;
  background: #f5f4ef;
}
.layout:has(.sidebar.collapsed) {
  --panel-left: 32px;
}
/* The panel floats over the map rather than sharing space with it, so toggling it
   never resizes the map: nothing moves and no tiles need reloading. */
.sidebar {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 3;
  width: 376px;
  overflow: hidden;
  border-right: 1px solid #e3e2dc;
  background: #fbfaf7;
  transition: transform 200ms ease;
}
.sidebar.collapsed {
  transform: translateX(calc(32px - 100%));
}
/* Fixed width so the content slides out of view instead of re-wrapping mid-animation. */
.sidebar-content {
  width: 376px;
  height: 100%;
  box-sizing: border-box;
  overflow-y: auto;
  /* Still scrolls (wheel, touch, keyboard), but without a scrollbar eating into the layout. */
  scrollbar-width: none;
  padding: 22px 20px 26px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  transition:
    opacity 120ms ease,
    visibility 0s;
}
.sidebar-content::-webkit-scrollbar {
  display: none;
}
.collapsed .sidebar-content {
  opacity: 0;
  visibility: hidden;
  transition:
    opacity 120ms ease,
    visibility 0s 200ms;
}
.panel-toggle {
  position: absolute;
  top: 30px;
  right: 6px;
  z-index: 1;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: start center;
  padding: 4px 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}
.panel-toggle:hover .chevron {
  color: #276142;
}
/* Points the way the panel will move: left to hide, right to show. */
.panel-toggle .chevron {
  transform: rotate(90deg);
}
/* Collapsed, the whole rail is the button; the arrow stays where it was. */
.collapsed .panel-toggle {
  top: 0;
  right: 0;
  width: 32px;
  height: 100%;
  padding-top: 34px;
}
.collapsed .panel-toggle .chevron {
  transform: rotate(-90deg);
}
.app-header {
  padding-right: 18px;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.map-panel {
  position: absolute;
  inset: 0;
}
.map-panel :deep(.maplibregl-ctrl-bottom-left) {
  left: var(--panel-left);
  transition: left 200ms ease;
}
.map-panel :deep(.maplibregl-ctrl-bottom-left),
.map-panel :deep(.maplibregl-ctrl-bottom-right) {
  bottom: var(--panel-bottom);
  transition:
    left 200ms ease,
    bottom 200ms ease;
}
.app-header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.brand-mark {
  width: 40px;
  height: 40px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: #e7f0e8;
  color: #276142;
  font-size: 25px;
  font-weight: 700;
}
.brand-copy h1 {
  margin: 0;
  color: #172d25;
  font-size: 19px;
  line-height: 1.25;
  letter-spacing: -0.025em;
}
.subtitle {
  margin: 4px 0 0;
  color: #70766f;
  font-size: 12px;
}
.data-status {
  min-height: 38px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 11px;
  border: 1px solid #d8e7d9;
  border-radius: 9px;
  background: #eff6ee;
  color: #315b3d;
  font-size: 12px;
  font-weight: 600;
}
.data-status.is-empty {
  border-color: #e8e5dc;
  background: #f3f1eb;
  color: #6e7069;
}
.status-dot {
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 50%;
  background: #43835b;
}
.is-empty .status-dot {
  background: #aaa79e;
}
.status-count {
  margin-left: auto;
  color: #627266;
  font-weight: 500;
}
.panel-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.section-heading h2 {
  margin: 2px 0 0;
  color: #1d3028;
  font-size: 15px;
  line-height: 1.3;
}
.eyebrow {
  color: #7d837c;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
}
.text-button {
  border: 0;
  padding: 5px 0 5px 8px;
  background: transparent;
  color: #73766f;
  font-size: 11px;
  cursor: pointer;
}
.text-button:not(:disabled):hover {
  color: #b34838;
}
.text-button:disabled {
  opacity: 0.45;
  cursor: default;
}
.upload-card,
.filter-section {
  padding: 12px;
  border: 1px solid #e6e3db;
  border-radius: 12px;
  background: #fff;
}
.upload-card {
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.primary-upload :deep(.drop) {
  min-height: 56px;
  border: 1px solid #2f7049;
  background: #34784f;
  color: #fff;
}
.primary-upload :deep(.drop strong) {
  font-size: 12px;
}
.primary-upload :deep(.drop span) {
  color: #e2f0e4;
}
.primary-upload :deep(.drop:hover),
.primary-upload :deep(.drop.dragging) {
  border-color: #245c3a;
  background: #2b6943;
}
.upload-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #989a92;
  font-size: 10px;
}
.upload-divider::before,
.upload-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #eeece5;
}
:deep(.drop) {
  min-height: 57px;
  gap: 3px;
  padding: 9px 10px;
  border: 1px dashed #c9d2c7;
  border-radius: 8px;
  background: #fbfcfa;
  color: #26382e;
  font-size: 11px;
}
:deep(.drop strong) {
  font-size: 11px;
  font-weight: 650;
}
:deep(.drop span) {
  color: #858a83;
  font-size: 10px;
}
:deep(.drop:hover),
:deep(.drop.dragging) {
  border-color: #43835b;
  background: #f1f7f0;
}
:deep(.report) {
  padding: 0 2px;
  color: #656b64;
  font-size: 10px;
}
:deep(.report p) {
  line-height: 1.5;
}
:deep(.report summary) {
  margin-top: 3px;
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.summary-card {
  min-height: 67px;
  padding: 9px 10px;
  border: 1px solid #e6e3db;
  border-radius: 10px;
  background: #fff;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 5px;
}
.summary-card strong {
  color: #1b3027;
  font-size: 21px;
  line-height: 1;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}
.summary-label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #6e746d;
  font-size: 10px;
}
.marker-dot {
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 50%;
}
.marker-dot.gone {
  background: #c84d3c;
}
.marker-dot.new {
  background: #3470b4;
}
.area-mark {
  width: 10px;
  height: 8px;
  border: 1.5px dashed #8754a5;
  border-radius: 2px;
}
.result-count {
  color: #6e766e;
  font-size: 10px;
  white-space: nowrap;
}
.field-label {
  display: block;
  margin-bottom: -5px;
  color: #646c64;
  font-size: 10px;
  font-weight: 600;
}
button:focus-visible,
input:focus-visible,
summary:focus-visible {
  outline: 2px solid #49865b;
  outline-offset: 2px;
}
.type-label {
  margin: 2px 0 -2px;
}
.filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.filter-chip {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border: 1px solid #e7e5de;
  border-radius: 7px;
  background: #fcfbf8;
  color: #4d574f;
  font-size: 10px;
  cursor: pointer;
  user-select: none;
}
.filter-chip input {
  width: 13px;
  height: 13px;
  margin: 0;
  accent-color: #427d50;
}
.chip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #8a8d8a;
}
.chip-gone .chip-dot {
  background: #c84d3c;
}
.chip-new .chip-dot {
  background: #3470b4;
}
.chip-unknown .chip-dot {
  background: #929694;
}
.advanced-filter {
  border-top: 1px solid #efeee9;
  padding-top: 8px;
}
.advanced-filter summary {
  color: #747a72;
  font-size: 10px;
}
.source-chips {
  margin-top: 8px;
}
.imagery-toggle {
  position: relative;
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-top: 1px solid #efeee9;
  padding-top: 8px;
  color: #49574d;
  font-size: 11px;
  cursor: pointer;
}
.toggle-copy {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.toggle-icon {
  color: #718378;
  font-size: 17px;
}
.imagery-toggle input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}
.switch {
  width: 31px;
  height: 18px;
  flex: none;
  position: relative;
  border-radius: 20px;
  background: #d6d8d2;
  transition: background 140ms ease;
}
.switch::after {
  content: '';
  width: 14px;
  height: 14px;
  position: absolute;
  top: 2px;
  left: 2px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px #0002;
  transition: transform 140ms ease;
}
.imagery-toggle input:checked + .switch {
  background: #43835b;
}
.imagery-toggle input:checked + .switch::after {
  transform: translateX(13px);
}
.imagery-toggle input:focus-visible + .switch {
  outline: 2px solid #49865b;
  outline-offset: 2px;
}
.legend-section {
  border-bottom: 1px solid #e8e6df;
  padding: 0 2px 12px;
}
.legend-section summary {
  color: #47554a;
  font-size: 11px;
  font-weight: 650;
}
.legend-section :deep(.legend) {
  margin-top: 10px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 10px;
  color: #646c64;
  font-size: 10px;
}
.legend-section :deep(li) {
  align-items: center;
}
.map-result-pill {
  position: absolute;
  right: 18px;
  bottom: calc(var(--panel-bottom) + 58px);
  z-index: 2;
  transition: bottom 200ms ease;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 11px;
  border: 1px solid #e4e2db;
  border-radius: 20px;
  background: #fffffff0;
  box-shadow: 0 3px 12px #23342612;
  color: #4c5b50;
  font-size: 10px;
  pointer-events: none;
}
.map-result-pill .status-dot {
  width: 7px;
  height: 7px;
}

@media (max-width: 820px) {
  /* On phones the panel is a bottom sheet over the map instead. */
  .layout {
    --panel-left: 0px;
    --panel-bottom: max(45dvh, 280px);
  }
  .layout:has(.sidebar.collapsed) {
    --panel-left: 0px;
    --panel-bottom: 32px;
  }
  .sidebar {
    top: auto;
    right: 0;
    width: auto;
    height: max(45dvh, 280px);
    border-right: none;
    border-top: 1px solid #ddd;
  }
  .sidebar.collapsed {
    transform: translateY(calc(100% - 32px));
  }
  .sidebar-content {
    width: auto;
    padding: 16px 16px 24px;
    gap: 14px;
  }
  .panel-toggle {
    top: 14px;
    right: 8px;
  }
  .panel-toggle .chevron {
    transform: none;
  }
  .collapsed .panel-toggle {
    width: 100%;
    height: 32px;
    place-items: center end;
    padding: 0 12px 0 0;
  }
  .collapsed .panel-toggle .chevron {
    transform: rotate(180deg);
  }
}

@media (max-width: 420px) {
  .sidebar-content {
    padding-right: 12px;
    padding-left: 12px;
  }
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .map-result-pill {
    right: 10px;
    bottom: calc(var(--panel-bottom) + 50px);
  }
}
</style>
