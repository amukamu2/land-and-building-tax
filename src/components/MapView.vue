<script setup lang="ts">
import {
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  useTemplateRef,
  watch,
} from "vue";
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
} from "maplibre-gl";
// MapLibre v6 looks for its worker file next to its own script, which breaks once
// Vite bundles it (blank map, "Worker failed to load"). `?url` makes Vite ship the
// worker as a separate asset and hand us its final URL, in dev and in the build.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import type { ExpressionSpecification } from "@maplibre/maplibre-gl-style-spec";
import "maplibre-gl/dist/maplibre-gl.css";
import type {
  ChangeCollection,
  ChangeProps,
  TestAreaCollection,
} from "../data/BuildingChangeSource";
import { CHANGE_COLORS, TEST_AREA_COLOR } from "../mapStyle";
import ChangeDetails from "./ChangeDetails.vue";

/** Screen space covered by UI floating over the map (e.g. the side panel), in px. */
export type MapInset = Partial<PaddingOptions>;

const POPOVER_WIDTH = 340;
const POPOVER_HEIGHT = 240;
/** How many change-point boxes the popup shows before its list scrolls. */
const POPOVER_VISIBLE_BOXES = 3;
/** How much of the next box peeks out below them, hinting that the list scrolls. */
const POPOVER_PEEK_PX = 28;

// Angular: `defineProps` ≈ @Input() and `defineEmits` ≈ @Output() EventEmitter.
const props = defineProps<{
  changes: ChangeCollection;
  testAreas: TestAreaCollection;
  satellite: boolean;
  inset?: MapInset;
  getInset?: () => MapInset;
}>();

setWorkerUrl(workerUrl);

const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const SATELLITE_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const CLICK_TOLERANCE_PX = 6;

// Angular: a template ref ≈ @ViewChild. It matches `ref="container"` in the template
// and is filled in by the time onMounted runs.
const container = useTemplateRef<HTMLDivElement>("container");
const popoverElement = useTemplateRef<HTMLDivElement>("popover");
const popoverDetails = useTemplateRef<HTMLDivElement>("popoverDetails");
const popoverFeatures = ref<ChangeProps[]>([]);
const popoverCoordinates = ref<[number, number] | null>(null);
const popoverPosition = ref({
  left: 0,
  top: 0,
  placement: "right" as "right" | "left" | "above" | "below",
});

// The map is NOT reactive state: Vue must not wrap it in a Proxy (that breaks MapLibre).
// A plain variable is enough because the template never reads it.
let map: MapLibreMap | null = null;
let loaded = false;

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
  });
  m.addControl(new NavigationControl(), "top-right");
  m.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");

  m.on("load", () => {
    addLayers();
    loaded = true;
  });
  m.on("click", onClick);
  m.on("move", updatePopoverPosition);
  m.on("resize", updatePopoverPosition);
  m.on("mouseenter", "changes-circle", () => setCursor("pointer"));
  m.on("mouseleave", "changes-circle", () => setCursor(""));
  map = m;
});

onUnmounted(() => {
  map?.remove();
  map = null;
  loaded = false;
});

// Angular: `watch` ≈ reacting in ngOnChanges (or an `effect` on a signal input).
// New data → update the existing GeoJSON source; never recreate the map.
watch(
  () => props.changes,
  (data) => {
    if (!loaded) return; // `load` will pick up the current props
    getSource("changes")?.setData(withStackFlag(data));
    setSelected([]);
    closePopover();
  },
);
watch(
  () => props.testAreas,
  (data) => loaded && getSource("test-areas")?.setData(data),
);
watch(
  () => props.satellite,
  (on) =>
    loaded &&
    map?.setLayoutProperty("satellite", "visibility", on ? "visible" : "none"),
);

function addLayers() {
  if (!map) return;

  // Satellite imagery sits under the basemap's labels so street names stay readable.
  const firstSymbolLayer = map
    .getStyle()
    .layers.find((l) => l.type === "symbol")?.id;
  map.addSource("satellite", {
    type: "raster",
    tiles: [SATELLITE_TILES],
    tileSize: 256,
    maxzoom: 19,
    attribution:
      "Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community",
  });
  map.addLayer(
    {
      id: "satellite",
      type: "raster",
      source: "satellite",
      layout: { visibility: props.satellite ? "visible" : "none" },
    },
    firstSymbolLayer,
  );

  map.addSource("test-areas", { type: "geojson", data: props.testAreas });
  map.addLayer({
    id: "test-areas-fill",
    type: "fill",
    source: "test-areas",
    paint: { "fill-color": TEST_AREA_COLOR, "fill-opacity": 0.06 },
  });
  map.addLayer({
    id: "test-areas-line",
    type: "line",
    source: "test-areas",
    paint: {
      "line-color": TEST_AREA_COLOR,
      "line-width": 2,
      "line-dasharray": [3, 2],
    },
  });

  // `generateId` numbers features by their index, so a clicked feature's id
  // points straight back into `props.changes.features`.
  map.addSource("changes", {
    type: "geojson",
    data: withStackFlag(props.changes),
    generateId: true,
  });

  // Highlight ring under the selected point(s).
  map.addLayer({
    id: "changes-selected",
    type: "circle",
    source: "changes",
    filter: ["in", ["id"], ["literal", []]],
    paint: {
      "circle-radius": 16,
      "circle-color": "#ffd400",
      "circle-opacity": 0.9,
    },
  });

  // Code rows = filled dots. Answer-key rows = larger hollow rings, so a code dot
  // and its matching answer ring at the same spot are both visible.
  const isAnswer: ExpressionSpecification = ["==", ["get", "kind"], "answer"];
  const typeColor: ExpressionSpecification = [
    "match",
    ["get", "type"],
    "gone",
    CHANGE_COLORS.gone,
    "new",
    CHANGE_COLORS.new,
    CHANGE_COLORS.unknown,
  ];
  const radius = 9;
  // A "new" dot sharing its spot with another point shrinks so the one under it stays visible.
  const codeRadius: ExpressionSpecification = [
    "case",
    ["all", ["get", "stacked"], ["==", ["get", "type"], "new"]],
    5.5,
    radius,
  ];

  map.addLayer({
    id: "changes-circle",
    type: "circle",
    source: "changes",
    layout: {
      // Higher sort key = drawn on top. Points at the same spot cover each other;
      // clicking there still lists all of them in the side panel.
      "circle-sort-key": ["match", ["get", "type"], "gone", 0, "unknown", 1, 2],
    },
    paint: {
      "circle-radius": ["case", isAnswer, radius + 4, codeRadius],
      "circle-color": typeColor,
      "circle-opacity": ["case", isAnswer, 0, 0.95],
      "circle-stroke-color": ["case", isAnswer, typeColor, "#ffffff"],
      "circle-stroke-width": ["case", isAnswer, 3, 1.5],
    },
  });
}

/**
 * Adds a display-only `stacked` flag to points that share their exact position with
 * another point. Feature order is kept, so `generateId` ids still match `props.changes`.
 */
function withStackFlag(data: ChangeCollection): ChangeCollection {
  const key = (f: ChangeCollection["features"][number]) =>
    f.geometry.coordinates.join(",");
  const counts = new Map<string, number>();
  for (const f of data.features)
    counts.set(key(f), (counts.get(key(f)) ?? 0) + 1);
  return {
    ...data,
    features: data.features.map((f) => ({
      ...f,
      properties: { ...f.properties, stacked: (counts.get(key(f)) ?? 0) > 1 },
    })),
  };
}

function onClick(e: MapMouseEvent) {
  if (!map || !loaded) return;
  const { x, y } = e.point;
  const hits = map.queryRenderedFeatures(
    [
      [x - CLICK_TOLERANCE_PX, y - CLICK_TOLERANCE_PX],
      [x + CLICK_TOLERANCE_PX, y + CLICK_TOLERANCE_PX],
    ],
    { layers: ["changes-circle"] },
  );
  // Look the rows up in our own data instead of using `hit.properties`, because
  // MapLibre drops/serializes some property values. Dedupe: a feature can be hit twice.
  const ids = [
    ...new Set(
      hits
        .map((h) => h.id)
        .filter((id): id is number => typeof id === "number"),
    ),
  ];
  const features = ids
    .map((id) => props.changes.features[id]?.properties)
    .filter((p) => p !== undefined);

  setSelected(ids);
  if (features.length === 0 || ids.length === 0) {
    closePopover();
    return;
  }

  const firstId = ids[0];
  if (firstId === undefined) return;
  const coordinates = props.changes.features[firstId]?.geometry.coordinates as
    | [number, number]
    | undefined;
  if (!coordinates) return;
  popoverFeatures.value = features;
  popoverCoordinates.value = coordinates;
  focusPoint(coordinates);
  void nextTick(() => {
    fitPopoverDetails();
    updatePopoverPosition();
  });
}

// Boxes differ in height (optional fields add rows), so measure where the third one ends
// instead of guessing a pixel height. The CSS cap for small screens still applies on top.
function fitPopoverDetails() {
  const details = popoverDetails.value;
  if (!details) return;
  details.scrollTop = 0;
  const boxes = details.querySelectorAll("article");
  const lastVisible = boxes[POPOVER_VISIBLE_BOXES - 1];
  if (boxes.length > POPOVER_VISIBLE_BOXES && lastVisible) {
    const height =
      lastVisible.getBoundingClientRect().bottom -
      details.getBoundingClientRect().top;
    details.style.setProperty(
      "--boxes-height",
      `${Math.ceil(height) + POPOVER_PEEK_PX}px`,
    );
  } else {
    details.style.removeProperty("--boxes-height");
  }
}

function focusPoint(coordinates: [number, number]) {
  if (!map || !container.value) return;
  const inset = currentInset();
  const mobile = container.value.clientWidth <= 820;
  const padding: PaddingOptions = mobile
    ? {
        top: 24 + (inset.top ?? 0),
        right: 24 + (inset.right ?? 0),
        bottom: 24 + (inset.bottom ?? 0) + POPOVER_HEIGHT,
        left: 24 + (inset.left ?? 0),
      }
    : {
        top: 24 + (inset.top ?? 0),
        right: 24 + (inset.right ?? 0) + POPOVER_WIDTH,
        bottom: 24 + (inset.bottom ?? 0),
        left: 24 + (inset.left ?? 0),
      };
  map.easeTo({ center: coordinates, padding, duration: 500 });
}

function updatePopoverPosition() {
  if (
    !map ||
    !container.value ||
    !popoverCoordinates.value ||
    !popoverElement.value
  )
    return;
  const { width, height } = container.value.getBoundingClientRect();
  const point = map.project(popoverCoordinates.value);
  const card = popoverElement.value.getBoundingClientRect();
  const inset = currentInset();
  const mobile = width <= 820;
  const margin = 14;

  if (mobile) {
    const leftLimit = margin + (inset.left ?? 0);
    const rightLimit = width - margin - (inset.right ?? 0);
    const left = Math.max(
      leftLimit + card.width / 2,
      Math.min(point.x, rightLimit - card.width / 2),
    );
    const visibleBottom = height - (inset.bottom ?? 0) - margin;
    const below = point.y + card.height + 22 <= visibleBottom;
    const top = below ? point.y + 18 : point.y - card.height - 18;
    popoverPosition.value = {
      left,
      top: Math.max(margin, Math.min(top, visibleBottom - card.height)),
      placement: below ? "below" : "above",
    };
    return;
  }

  const leftLimit = margin + (inset.left ?? 0);
  const rightLimit = width - margin - (inset.right ?? 0);
  const canPlaceRight = point.x + card.width + 20 <= rightLimit;
  const canPlaceLeft = point.x - card.width - 20 >= leftLimit;
  const placement = canPlaceRight ? "right" : canPlaceLeft ? "left" : "right";
  const left =
    placement === "right"
      ? Math.max(leftLimit, Math.min(point.x + 18, rightLimit - card.width))
      : Math.max(leftLimit, point.x - card.width - 18);
  const top = Math.max(
    margin,
    Math.min(point.y - card.height / 2, height - card.height - margin),
  );
  popoverPosition.value = { left, top, placement };
}

function closePopover() {
  popoverFeatures.value = [];
  popoverCoordinates.value = null;
  setSelected([]);
}

function currentInset(): MapInset {
  return props.getInset?.() ?? props.inset ?? {};
}

function setSelected(ids: number[]) {
  map?.setFilter("changes-selected", ["in", ["id"], ["literal", ids]]);
}

function setCursor(cursor: string) {
  if (map) map.getCanvas().style.cursor = cursor;
}

function getSource(id: string) {
  return map?.getSource<GeoJSONSource>(id);
}

/** Zooms to a test area by its ID. */
function fitPadding(base: number, inset: MapInset = {}): PaddingOptions {
  return {
    top: base + (inset.top ?? 0),
    right: base + (inset.right ?? 0),
    bottom: base + (inset.bottom ?? 0),
    left: base + (inset.left ?? 0),
  };
}

function fitToArea(areaId: string, inset?: MapInset) {
  const area = props.testAreas.features.find((f) => f.properties.id === areaId);
  const ring = area?.geometry.coordinates[0];
  if (!map || !ring) return;
  const [sw, , ne] = ring as [number, number][];
  map.fitBounds([sw, ne] as LngLatBoundsLike, {
    padding: fitPadding(40, inset),
  });
}

/** Zooms to fit all change points (used after loading a new file). */
function fitToChanges(inset?: MapInset) {
  const coords = props.changes.features.map(
    (f) => f.geometry.coordinates as [number, number],
  );
  if (!map || coords.length === 0) return;
  const bounds = coords.reduce(
    (b, c) => b.extend(c),
    new LngLatBounds(coords[0], coords[0]),
  );
  map.fitBounds(bounds, { padding: fitPadding(60, inset), maxZoom: 16 });
}

// Angular: like public methods on a component you reach via @ViewChild.
defineExpose({ fitToArea, fitToChanges });
</script>

<template>
  <div class="map-frame">
    <div ref="container" class="map"></div>
    <section
      v-if="popoverFeatures.length"
      ref="popover"
      class="point-popover"
      :class="`placement-${popoverPosition.placement}`"
      :style="{
        left: `${popoverPosition.left}px`,
        top: `${popoverPosition.top}px`,
      }"
      aria-label="Selected point details"
    >
      <header class="popover-header">
        <strong
          >Selected point{{ popoverFeatures.length > 1 ? "s" : "" }}</strong
        >
        <button
          class="popover-close"
          type="button"
          aria-label="Close point details"
          @click="closePopover"
        >
          ×
        </button>
      </header>
      <div ref="popoverDetails" class="popover-details">
        <ChangeDetails :features="popoverFeatures" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.map-frame {
  position: relative;
  width: 100%;
  height: 100%;
}
.map {
  width: 100%;
  height: 100%;
}
.point-popover {
  position: absolute;
  z-index: 5;
  box-sizing: border-box;
  width: min(340px, calc(100% - 28px));
  max-height: min(70dvh, 520px);
  overflow: hidden;
  padding: 13px;
  border: 1px solid #e3e2dc;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 8px 28px #1d2a241f;
}
.point-popover::before {
  position: absolute;
  top: 50%;
  left: -7px;
  width: 12px;
  height: 12px;
  border-bottom: 1px solid #e3e2dc;
  border-left: 1px solid #e3e2dc;
  background: #fff;
  content: "";
  transform: translateY(-50%) rotate(45deg);
}
.point-popover.placement-left::before {
  right: -7px;
  left: auto;
  border: 0;
  border-top: 1px solid #e3e2dc;
  border-right: 1px solid #e3e2dc;
  transform: translateY(-50%) rotate(45deg);
}
.point-popover.placement-below::before,
.point-popover.placement-above::before {
  top: -7px;
  left: 50%;
  border: 0;
  border-top: 1px solid #e3e2dc;
  border-left: 1px solid #e3e2dc;
  transform: translateX(-50%) rotate(45deg);
}
.point-popover.placement-above::before {
  top: auto;
  bottom: -7px;
  border: 0;
  border-right: 1px solid #e3e2dc;
  border-bottom: 1px solid #e3e2dc;
}
.popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  color: #34483a;
  font-size: 13px;
}
.popover-close {
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #667067;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}
.popover-close:hover {
  background: #f1f3ef;
}
.popover-details {
  max-height: min(var(--boxes-height, 100dvh), calc(min(70dvh, 520px) - 52px));
  overflow: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.popover-details::-webkit-scrollbar {
  display: none;
}
@media (max-width: 820px) {
  .point-popover {
    max-height: min(40dvh, 340px);
  }
  .popover-details {
    max-height: min(
      var(--boxes-height, 100dvh),
      calc(min(40dvh, 340px) - 52px)
    );
  }
}
</style>
