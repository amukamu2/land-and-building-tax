import { ref, shallowRef } from 'vue'
import type {
  BuildingChangeSource,
  ChangeCollection,
  RowIssue,
  TestAreaCollection,
} from '../data/BuildingChangeSource'

/** What happened the last time a table was loaded. Shown to the user. */
export interface LoadReport {
  label: string
  rowCount: number
  loadedCount: number
  issues: RowIssue[]
  error: string | null
}

const emptyCollection = () => ({ type: 'FeatureCollection' as const, features: [] })

/**
 * Loads building changes and test areas through any `BuildingChangeSource`
 * and exposes them as reactive state.
 *
 * Angular: a composable is like a small injectable service, but it's just a
 * function. Each call creates its own state (unless you hoist the refs out of it).
 */
export function useBuildingChanges() {
  // Angular: `ref` ≈ a writable signal; read/write it with `.value` in TS (templates unwrap it).
  // `shallowRef` only tracks replacing `.value`, not deep changes, which is cheaper for
  // big GeoJSON objects that we always replace as a whole.
  const changes = shallowRef<ChangeCollection>(emptyCollection())
  const testAreas = shallowRef<TestAreaCollection>(emptyCollection())
  const changesReport = ref<LoadReport | null>(null)
  const testAreasReport = ref<LoadReport | null>(null)
  const loading = ref(false)

  /** Replaces the change points. On error, the previous points stay on the map. */
  async function loadChanges(source: BuildingChangeSource, label: string): Promise<boolean> {
    loading.value = true
    try {
      const result = await source.getChanges()
      changes.value = result.data
      changesReport.value = report(label, result.rowCount, result.data.features.length, result.issues)
      return true
    } catch (e) {
      changesReport.value = { ...report(label, 0, 0, []), error: errorMessage(e) }
      return false
    } finally {
      loading.value = false
    }
  }

  /** Replaces the test areas. On error, the previous areas stay on the map. */
  async function loadTestAreas(source: BuildingChangeSource, label: string): Promise<boolean> {
    loading.value = true
    try {
      const result = await source.getTestAreas()
      testAreas.value = result.data
      testAreasReport.value = report(label, result.rowCount, result.data.features.length, result.issues)
      return true
    } catch (e) {
      testAreasReport.value = { ...report(label, 0, 0, []), error: errorMessage(e) }
      return false
    } finally {
      loading.value = false
    }
  }

  /** Removes all loaded points and test areas. */
  function clear() {
    changes.value = emptyCollection()
    testAreas.value = emptyCollection()
    changesReport.value = null
    testAreasReport.value = null
  }

  return { changes, testAreas, changesReport, testAreasReport, loading, loadChanges, loadTestAreas, clear }
}

function report(label: string, rowCount: number, loadedCount: number, issues: RowIssue[]): LoadReport {
  return { label, rowCount, loadedCount, issues, error: null }
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
