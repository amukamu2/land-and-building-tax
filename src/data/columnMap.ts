import type { ChangeType } from './BuildingChangeSource'

/**
 * The ONLY place that knows the CSV header names.
 * If another team renames a column, add the new name to the alias list here.
 *
 * Headers are matched after normalization (see `normalizeHeader`), so case,
 * extra spaces and a UTF-8 BOM don't matter.
 */

/** Columns of the change tables (code output `C…` and answer key `A…`). */
export const CHANGE_COLUMNS = {
  id: ['ID'],
  placeId: ['PlaceID', 'Place ID'],
  lat: ['Lat', 'Latitude'],
  lng: ['Lng', 'Lon', 'Long', 'Longitude'],
  type: ['ประเภท', 'Type'],
  yearFirstSeen: ['ปีที่เริ่มเห็น', 'Year'],
  areaM2: ['Area (m^2)', 'Area (m2)', 'Area'],
  isLowRise: ['ตึกเตี้ยมั้ย? (Y/N)', 'ตึกเตี้ยมั้ย?', 'ตึกเตี้ยมั้ย'],
  addedAfterCode: ['เพิ่มหลังเห็นผลของ code? (Y/N)', 'เพิ่มหลังเห็นผลของ code?', 'เพิ่มหลังเห็นผลของ code'],
  note: ['Note', 'Notes'],
} as const

export const REQUIRED_CHANGE_COLUMNS = ['id', 'placeId', 'lat', 'lng', 'type'] as const

/** Columns of the test-area table. */
export const TEST_AREA_COLUMNS = {
  id: ['ID'],
  name: ['Name'],
  bottomLeftLat: ['Bottom-Left Lat'],
  bottomLeftLng: ['Bottom-Left Lng'],
  topRightLat: ['Top-Right Lat'],
  topRightLng: ['Top-Right Lng'],
} as const

export const REQUIRED_TEST_AREA_COLUMNS = [
  'id',
  'bottomLeftLat',
  'bottomLeftLng',
  'topRightLat',
  'topRightLng',
] as const

/** Values of the `ประเภท` column. */
export const CHANGE_TYPE_VALUES: Record<string, ChangeType> = {
  อาคารเดิมถูกรื้อ: 'gone', // existing building demolished
  อาคารใหม่สร้างบนที่เดิม: 'new', // new building built
  gone: 'gone',
  new: 'new',
}

/** Y/N columns. */
export const YES_VALUES = ['y', 'yes', 'true', '1']
export const NO_VALUES = ['n', 'no', 'false', '0']

/** Strip BOM / zero-width characters, trim, collapse spaces, lowercase. */
export function normalizeHeader(header: string): string {
  return header
    .normalize('NFC')
    .replace(/[﻿​-‍]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

export function normalizeValue(value: string): string {
  return normalizeHeader(value)
}
