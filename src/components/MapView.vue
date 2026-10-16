<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef, watch } from 'vue'
import {
  LngLatBounds,
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  type GeoJSONSource,
  type LngLatBoundsLike,
  type MapMouseEvent,
  type PaddingOptions,
  setWorkerUrl,
} from 'maplibre-gl'
// MapLibre v6 looks for its worker file next to its own script, which breaks once
// Vite bundles it (blank map, "Worker failed to load"). `?url` makes Vite ship the
// worker as a separate asset and hand us its final URL, in dev and in the build.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { ChangeCollection, ChangeProps, TestAreaCollection } from '../data/BuildingChangeSource'
import { CHANGE_COLORS, TEST_AREA_COLOR } from '../mapStyle'

// Angular: `defineProps` ≈ @Input() and `defineEmits` ≈ @Output() EventEmitter.
const props = defineProps<{
  changes: ChangeCollection
  testAreas: TestAreaCollection
  satellite: boolean
}>()

const emit = defineEmits<{
  /** All change points under the click (several when points overlap). Empty = clicked nothing. */
  select: [features: ChangeProps[]]
}>()

setWorkerUrl(workerUrl)

const BASEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const SATELLITE_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const CLICK_TOLERANCE_PX = 6

// Angular: a template ref ≈ @ViewChild. It matches `ref="container"` in the template
// and is filled in by the time onMounted runs.
const container = useTemplateRef<HTMLDivElement>('container')

// The map is NOT reactive state: Vue must not wrap it in a Proxy (that breaks MapLibre).
// A plain variable is enough because the template never reads it.
let map: MapLibreMap | null = null
let loaded = false

// Angular: onMounted ≈ ngAfterViewInit, onUnmounted ≈ ngOnDestroy.
onMounted(() => {
  const m = new MapLibreMap({
    container: container.value!,
    style: BASEMAP_STYLE,
    center: [100.5468, 13.7341], // between Sirikit Centre and Siam Square
    zoom: 14,
    minZoom: 10,
    maxBounds: [
      [100.3, 13.5],
      [100.95, 14.0],
    ],
  })
  m.addControl(new NavigationControl(), 'top-right')
  m.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left')

  m.on('load', () => {
    addLayers()
    loaded = true
  })
  m.on('click', onClick)
  m.on('mouseenter', 'changes-circle', () => setCursor('pointer'))
  m.on('mouseleave', 'changes-circle', () => setCursor(''))
  map = m
})

onUnmounted(() => {
  map?.remove()
  map = null
  loaded = false
})

// Angular: `watch` ≈ reacting in ngOnChanges (or an `effect` on a signal input).
// New data → update the existing GeoJSON source; never recreate the map.
watch(
  () => props.changes,
  (data) => {
    if (!loaded) return // `load` will pick up the current props
    getSource('changes')?.setData(withStackFlag(data))
    setSelected([])
    emit('select', [])
  },
)
watch(
  () => props.testAreas,
  (data) => loaded && getSource('test-areas')?.setData(data),
)
watch(
  () => props.satellite,
  (on) => loaded && map?.setLayoutProperty('satellite', 'visibility', on ? 'visible' : 'none'),
)

function addLayers() {
  if (!map) return

  // Satellite imagery sits under the basemap's labels so street names stay readable.
  const firstSymbolLayer = map.getStyle().layers.find((l) => l.type === 'symbol')?.id
  map.addSource('satellite', {
    type: 'raster',
    tiles: [SATELLITE_TILES],
    tileSize: 256,
    maxzoom: 19,
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  })
  map.addLayer(
    {
      id: 'satellite',
      type: 'raster',
      source: 'satellite',
      layout: { visibility: props.satellite ? 'visible' : 'none' },
    },
    firstSymbolLayer,
  )

  map.addSource('test-areas', { type: 'geojson', data: props.testAreas })
  map.addLayer({
    id: 'test-areas-fill',
    type: 'fill',
    source: 'test-areas',
    paint: { 'fill-color': TEST_AREA_COLOR, 'fill-opacity': 0.06 },
  })
  map.addLayer({
    id: 'test-areas-line',
    type: 'line',
    source: 'test-areas',
    paint: { 'line-color': TEST_AREA_COLOR, 'line-width': 2, 'line-dasharray': [3, 2] },
  })

  // `generateId` numbers features by their index, so a clicked feature's id
  // points straight back into `props.changes.features`.
  map.addSource('changes', { type: 'geojson', data: withStackFlag(props.changes), generateId: true })

  // Highlight ring under the selected point(s).
  map.addLayer({
    id: 'changes-selected',
    type: 'circle',
    source: 'changes',
    filter: ['in', ['id'], ['literal', []]],
    paint: { 'circle-radius': 16, 'circle-color': '#ffd400', 'circle-opacity': 0.9 },
  })

  // Code rows = filled dots. Answer-key rows = larger hollow rings, so a code dot
  // and its matching answer ring at the same spot are both visible.
  const isAnswer: ExpressionSpecification = ['==', ['get', 'kind'], 'answer']
  const typeColor: ExpressionSpecification = [
    'match',
    ['get', 'type'],
    'gone',
    CHANGE_COLORS.gone,
    'new',
    CHANGE_COLORS.new,
    CHANGE_COLORS.unknown,
  ]
  const radius = 9
  // A "new" dot sharing its spot with another point shrinks so the one under it stays visible.
  const codeRadius: ExpressionSpecification = [
    'case',
    ['all', ['get', 'stacked'], ['==', ['get', 'type'], 'new']],
    5.5,
    radius,
  ]

  map.addLayer({
    id: 'changes-circle',
    type: 'circle',
    source: 'changes',
    layout: {
      // Higher sort key = drawn on top. Points at the same spot cover each other;
      // clicking there still lists all of them in the side panel.
      'circle-sort-key': ['match', ['get', 'type'], 'gone', 0, 'unknown', 1, 2],
    },
    paint: {
      'circle-radius': ['case', isAnswer, radius + 4, codeRadius],
      'circle-color': typeColor,
      'circle-opacity': ['case', isAnswer, 0, 0.95],
      'circle-stroke-color': ['case', isAnswer, typeColor, '#ffffff'],
      'circle-stroke-width': ['case', isAnswer, 3, 1.5],
    },
  })
}

/**
 * Adds a display-only `stacked` flag to points that share their exact position with
 * another point. Feature order is kept, so `generateId` ids still match `props.changes`.
 */
function withStackFlag(data: ChangeCollection): ChangeCollection {
  const key = (f: ChangeCollection['features'][number]) => f.geometry.coordinates.join(',')
  const counts = new Map<string, number>()
  for (const f of data.features) counts.set(key(f), (counts.get(key(f)) ?? 0) + 1)
  return {
    ...data,
    features: data.features.map((f) => ({
      ...f,
      properties: { ...f.properties, stacked: (counts.get(key(f)) ?? 0) > 1 },
    })),
  }
}

function onClick(e: MapMouseEvent) {
  if (!map || !loaded) return
  const { x, y } = e.point
  const hits = map.queryRenderedFeatures(
    [
      [x - CLICK_TOLERANCE_PX, y - CLICK_TOLERANCE_PX],
      [x + CLICK_TOLERANCE_PX, y + CLICK_TOLERANCE_PX],
    ],
    { layers: ['changes-circle'] },
  )
  // Look the rows up in our own data instead of using `hit.properties`, because
  // MapLibre drops/serializes some property values. Dedupe: a feature can be hit twice.
  const ids = [...new Set(hits.map((h) => h.id).filter((id): id is number => typeof id === 'number'))]
  const features = ids.map((id) => props.changes.features[id]?.properties).filter((p) => p !== undefined)

  setSelected(ids)
  emit('select', features)
}

function setSelected(ids: number[]) {
  map?.setFilter('changes-selected', ['in', ['id'], ['literal', ids]])
}

function setCursor(cursor: string) {
  if (map) map.getCanvas().style.cursor = cursor
}

function getSource(id: string) {
  return map?.getSource<GeoJSONSource>(id)
}

/** Zooms to a test area by its ID. */
/** Screen space covered by UI floating over the map (e.g. the side panel), in px. */
export type MapInset = Partial<PaddingOptions>

function fitPadding(base: number, inset: MapInset = {}): PaddingOptions {
  return {
    top: base + (inset.top ?? 0),
    right: base + (inset.right ?? 0),
    bottom: base + (inset.bottom ?? 0),
    left: base + (inset.left ?? 0),
  }
}

function fitToArea(areaId: string, inset?: MapInset) {
  const area = props.testAreas.features.find((f) => f.properties.id === areaId)
  const ring = area?.geometry.coordinates[0]
  if (!map || !ring) return
  const [sw, , ne] = ring as [number, number][]
  map.fitBounds([sw, ne] as LngLatBoundsLike, { padding: fitPadding(40, inset) })
}

/** Zooms to fit all change points (used after loading a new file). */
function fitToChanges(inset?: MapInset) {
  const coords = props.changes.features.map((f) => f.geometry.coordinates as [number, number])
  if (!map || coords.length === 0) return
  const bounds = coords.reduce((b, c) => b.extend(c), new LngLatBounds(coords[0], coords[0]))
  map.fitBounds(bounds, { padding: fitPadding(60, inset), maxZoom: 16 })
}

// Angular: like public methods on a component you reach via @ViewChild.
defineExpose({ fitToArea, fitToChanges })
</script>

<template>
  <div ref="container" class="map"></div>
</template>

<style scoped>
.map {
  width: 100%;
  height: 100%;
}
</style>
