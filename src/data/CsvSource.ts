import Papa from 'papaparse'
import type { Feature, Point, Polygon } from 'geojson'
import type {
  BuildingChangeSource,
  ChangeCollection,
  ChangeProps,
  ChangeType,
  LoadResult,
  RowIssue,
  RowKind,
  TestAreaCollection,
  TestAreaProps,
} from './BuildingChangeSource'
import {
  CHANGE_COLUMNS,
  CHANGE_TYPE_VALUES,
  NO_VALUES,
  REQUIRED_CHANGE_COLUMNS,
  REQUIRED_TEST_AREA_COLUMNS,
  TEST_AREA_COLUMNS,
  YES_VALUES,
  normalizeHeader,
  normalizeValue,
} from './columnMap'

/** A CSV to read: an uploaded file, or a URL (e.g. a file in `public/`). */
export type CsvInput = File | { url: string; name: string }

export interface CsvSourceOptions {
  /** One or more change tables (code output and/or answer key). Their rows are merged. */
  changes?: CsvInput[]
  testAreas?: CsvInput
}

/** Rough box around Bangkok. Coordinates outside it are almost certainly a mistake. */
const BANGKOK = { minLat: 13.4, maxLat: 14.1, minLng: 100.2, maxLng: 101.0 }

type ColumnSpec = Record<string, readonly string[]>
type RawRow = Record<string, string>
/** Maps our property keys to the actual header found in the file. */
type HeaderLookup<K extends string> = Partial<Record<K, string>>

const TYPE_LOOKUP = new Map(
  Object.entries(CHANGE_TYPE_VALUES).map(([csvValue, type]) => [normalizeValue(csvValue), type]),
)

export class CsvSource implements BuildingChangeSource {
  constructor(private readonly options: CsvSourceOptions) {}

  async getChanges(): Promise<LoadResult<ChangeCollection>> {
    const result: LoadResult<ChangeCollection> = {
      data: { type: 'FeatureCollection', features: [] },
      rowCount: 0,
      issues: [],
    }
    const seenIds = new Set<string>()

    for (const input of this.options.changes ?? []) {
      const { rows, headers } = await readCsv(input)
      const file = input.name
      const cols = mapHeaders(headers, CHANGE_COLUMNS, REQUIRED_CHANGE_COLUMNS, file)
      result.rowCount += rows.length

      rows.forEach((row, i) => {
        const line = i + 2 // +1 for 1-based, +1 for the header line
        const feature = parseChangeRow(row, cols, file, line, result.issues)
        if (!feature) return

        const id = feature.properties.id
        if (seenIds.has(id)) {
          result.issues.push({ file, line, id, severity: 'warning', message: `Duplicate ID "${id}".` })
        }
        seenIds.add(id)
        result.data.features.push(feature)
      })
    }
    return result
  }

  async getTestAreas(): Promise<LoadResult<TestAreaCollection>> {
    const result: LoadResult<TestAreaCollection> = {
      data: { type: 'FeatureCollection', features: [] },
      rowCount: 0,
      issues: [],
    }
    const input = this.options.testAreas
    if (!input) return result

    const { rows, headers } = await readCsv(input)
    const file = input.name
    const cols = mapHeaders(headers, TEST_AREA_COLUMNS, REQUIRED_TEST_AREA_COLUMNS, file)
    result.rowCount = rows.length

    rows.forEach((row, i) => {
      const feature = parseTestAreaRow(row, cols, file, i + 2, result.issues)
      if (feature) result.data.features.push(feature)
    })
    return result
  }
}

// ---------------------------------------------------------------------------
// Row parsing
// ---------------------------------------------------------------------------

function parseChangeRow(
  row: RawRow,
  cols: HeaderLookup<keyof typeof CHANGE_COLUMNS>,
  file: string,
  line: number,
  issues: RowIssue[],
): Feature<Point, ChangeProps> | null {
  const get = (key: keyof typeof CHANGE_COLUMNS) => cell(row, cols[key])
  const id = get('id')
  const skip = (message: string) => {
    issues.push({ file, line, id: id || undefined, severity: 'skipped', message })
    return null
  }
  const warn = (message: string) => issues.push({ file, line, id: id || undefined, severity: 'warning', message })

  if (!id) return skip('Missing ID.')

  const position = parseLatLng(get('lat'), get('lng'))
  if (typeof position === 'string') return skip(position)

  const rawType = get('type')
  const type: ChangeType = TYPE_LOOKUP.get(normalizeValue(rawType)) ?? 'unknown'
  if (type === 'unknown') {
    console.warn(`[CsvSource] ${file} line ${line}: unknown change type "${rawType}"`)
    warn(`Unknown type "${rawType}" — shown in grey.`)
  }

  const yearText = get('yearFirstSeen')
  const yearFirstSeen = parseNumber(yearText)
  if (yearText && yearFirstSeen === null) warn(`Year "${yearText}" is not a number.`)

  const props: ChangeProps = {
    id,
    placeId: get('placeId'),
    kind: kindFromId(id),
    type,
    rawType,
    yearFirstSeen,
  }
  // Optional columns: only set when the table has them, so the detail panel
  // doesn't show answer-key fields for code rows and vice versa.
  if (cols.areaM2) props.areaM2 = parseNumber(get('areaM2'))
  if (cols.isLowRise) props.isLowRise = parseYesNo(get('isLowRise'))
  if (cols.addedAfterCode) props.addedAfterCode = parseYesNo(get('addedAfterCode'))
  if (cols.note) props.note = get('note')

  return { type: 'Feature', geometry: { type: 'Point', coordinates: position }, properties: props }
}

function parseTestAreaRow(
  row: RawRow,
  cols: HeaderLookup<keyof typeof TEST_AREA_COLUMNS>,
  file: string,
  line: number,
  issues: RowIssue[],
): Feature<Polygon, TestAreaProps> | null {
  const get = (key: keyof typeof TEST_AREA_COLUMNS) => cell(row, cols[key])
  const id = get('id')
  const skip = (message: string) => {
    issues.push({ file, line, id: id || undefined, severity: 'skipped', message })
    return null
  }

  if (!id) return skip('Missing ID.')

  const bottomLeft = parseLatLng(get('bottomLeftLat'), get('bottomLeftLng'))
  if (typeof bottomLeft === 'string') return skip(`Bottom-left: ${bottomLeft}`)
  const topRight = parseLatLng(get('topRightLat'), get('topRightLng'))
  if (typeof topRight === 'string') return skip(`Top-right: ${topRight}`)

  const [west, south] = bottomLeft
  const [east, north] = topRight
  if (west >= east || south >= north) return skip('Bottom-left corner is not below/left of the top-right corner.')

  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south],
        ],
      ],
    },
    properties: { id, name: get('name') || id },
  }
}

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------

/**
 * The one place where the CSV's `Lat, Lng` order becomes GeoJSON's `[lng, lat]`.
 * Returns an error message instead of a position when the values are unusable.
 */
function parseLatLng(latText: string, lngText: string): [number, number] | string {
  if (!latText || !lngText) return 'Missing Lat or Lng.'
  const lat = parseNumber(latText)
  const lng = parseNumber(lngText)
  if (lat === null || lng === null) return `Lat/Lng is not a number ("${latText}", "${lngText}").`

  const inBangkok = (la: number, ln: number) =>
    la >= BANGKOK.minLat && la <= BANGKOK.maxLat && ln >= BANGKOK.minLng && ln <= BANGKOK.maxLng
  if (!inBangkok(lat, lng)) {
    const hint = inBangkok(lng, lat) ? ' Lat and Lng look swapped.' : ''
    return `Outside Bangkok (lat ${lat}, lng ${lng}).${hint}`
  }
  return [lng, lat]
}

/** Parses "1,234.5" style numbers. Returns null for empty or invalid text. */
function parseNumber(text: string): number | null {
  const cleaned = text.replace(/,/g, '').trim()
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function parseYesNo(text: string): boolean | null {
  const v = normalizeValue(text)
  if (YES_VALUES.includes(v)) return true
  if (NO_VALUES.includes(v)) return false
  return null
}

function kindFromId(id: string): RowKind {
  const prefix = id.charAt(0).toUpperCase()
  return prefix === 'A' ? 'answer' : prefix === 'C' ? 'code' : 'other'
}

function cell(row: RawRow, header: string | undefined): string {
  return header ? (row[header] ?? '').trim() : ''
}

// ---------------------------------------------------------------------------
// File reading
// ---------------------------------------------------------------------------

/**
 * Finds which actual header holds each property. Throws a readable error if
 * required columns are missing.
 */
function mapHeaders<K extends string>(
  headers: string[],
  spec: Record<K, readonly string[]>,
  required: readonly K[],
  file: string,
): HeaderLookup<K> {
  const byNormalized = new Map(headers.map((h) => [normalizeHeader(h), h]))
  const lookup: HeaderLookup<K> = {}

  for (const key of Object.keys(spec) as K[]) {
    const match = (spec as ColumnSpec)[key]!.map(normalizeHeader).find((alias) => byNormalized.has(alias))
    if (match) lookup[key] = byNormalized.get(match)
  }

  const missing = required.filter((key) => !lookup[key])
  if (missing.length > 0) {
    const expected = missing.map((key) => `"${spec[key][0]}"`).join(', ')
    const found = headers.map((h) => `"${h}"`).join(', ') || '(none)'
    throw new Error(`${file}: missing required column(s) ${expected}. Columns found: ${found}.`)
  }
  return lookup
}

async function readCsv(input: CsvInput): Promise<{ rows: RawRow[]; headers: string[] }> {
  const text = decode(await readBytes(input))
  const parsed = Papa.parse<RawRow>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    // Strip BOM / zero-width chars and whitespace, but keep the header's original
    // spelling so error messages show what the user actually has.
    transformHeader: (h) => h.replace(/[﻿​-‍]/g, '').trim(),
  })
  return { rows: parsed.data, headers: parsed.meta.fields ?? [] }
}

async function readBytes(input: CsvInput): Promise<ArrayBuffer> {
  if (input instanceof File) return input.arrayBuffer()
  const response = await fetch(input.url)
  if (!response.ok) throw new Error(`Could not load ${input.name} (HTTP ${response.status}).`)
  return response.arrayBuffer()
}

/**
 * Decodes as UTF-8 (dropping a BOM). Excel's plain "CSV" export on Thai Windows
 * uses Windows-874 instead, so fall back to that when the bytes aren't valid UTF-8.
 */
function decode(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-874').decode(bytes)
  }
}
