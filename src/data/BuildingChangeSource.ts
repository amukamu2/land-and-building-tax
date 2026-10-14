import type { FeatureCollection, Point, Polygon } from 'geojson'

/** Normalized change type. `unknown` = a value we could not map (shown in a neutral color). */
export type ChangeType = 'gone' | 'new' | 'unknown'

/** Which table a row came from, derived from its ID prefix (`A…` / `C…`). */
export type RowKind = 'answer' | 'code' | 'other'

/** Properties of one change point. Optional fields only exist in some tables. */
export interface ChangeProps {
  id: string
  placeId: string
  kind: RowKind
  type: ChangeType
  /** The original type text from the table, kept for display and debugging. */
  rawType: string
  yearFirstSeen: number | null
  /** Code output only. */
  areaM2?: number | null
  /** Answer key only. */
  isLowRise?: boolean | null
  /** Answer key only. */
  addedAfterCode?: boolean | null
  /** Answer key only. */
  note?: string
}

export interface TestAreaProps {
  id: string
  name: string
}

export type ChangeCollection = FeatureCollection<Point, ChangeProps>
export type TestAreaCollection = FeatureCollection<Polygon, TestAreaProps>

/**
 * A problem with one input row.
 * `skipped` rows are not on the map; `warning` rows are on the map but something looked off.
 */
export interface RowIssue {
  /** Where the row came from, e.g. a file name. */
  file: string
  /** 1-based line number in the file (the header is line 1). */
  line: number
  id?: string
  severity: 'skipped' | 'warning'
  message: string
}

/** Data plus the per-row problems found while loading it. */
export interface LoadResult<T> {
  data: T
  /** How many data rows were read, including skipped ones. */
  rowCount: number
  issues: RowIssue[]
}

/**
 * The only way components get data. `CsvSource` implements it now; an `ApiSource`
 * (NestJS + PostGIS) can implement it later without touching any component.
 *
 * Fatal problems (file unreadable, required columns missing) are thrown as errors.
 * Per-row problems are returned in `issues`.
 */
export interface BuildingChangeSource {
  getChanges(): Promise<LoadResult<ChangeCollection>>
  getTestAreas(): Promise<LoadResult<TestAreaCollection>>
}
