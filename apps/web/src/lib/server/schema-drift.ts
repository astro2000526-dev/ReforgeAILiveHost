// Schema-drift tolerance (server-only).
//
// The web app and the DB ship on different cadences, and a connected DB can be a
// few migrations behind the code (e.g. a fresh cloud/local project that hasn't
// run 0005_avatar_background / 0006_avatar_frame_layout / 0007_reply_presets).
// When that happens a SELECT naming a not-yet-added column, or a query against a
// not-yet-created table, errors and would 500 the whole page. The web should
// DEGRADE, not die — so reads fall back to the base columns (filling sane
// defaults for the missing ones) or to an empty result for a missing table.

import 'server-only'

// avatars columns guaranteed by 0001 vs. added by 0005/0006.
export const AVATAR_BASE_COLS =
  'id, name, preview_image_url, template_video_url, region, gender, display_order, description, is_active'
export const AVATAR_EXT_COLS =
  'bg_remove, background_url, background_type, camera_zoom, frame_position, frame_scale'
export const AVATAR_FULL_COLS = `${AVATAR_BASE_COLS}, ${AVATAR_EXT_COLS}`

// Keys + defaults for the 0005/0006 columns — used to strip them from an UPDATE
// patch and to backfill rows read from a behind-schema DB.
export const AVATAR_EXT_KEYS = [
  'bg_remove', 'background_url', 'background_type', 'camera_zoom', 'frame_position', 'frame_scale',
] as const

export const AVATAR_EXT_DEFAULTS: Record<string, unknown> = {
  bg_remove: false,
  background_url: null,
  background_type: null,
  camera_zoom: 1.0,
  frame_position: 'center',
  frame_scale: 1.0,
}

type PgErr = { code?: string; message?: string } | null | undefined

// PG 42703 / PostgREST "column ... does not exist".
export function isMissingColumn(e: PgErr): boolean {
  if (!e) return false
  return e.code === '42703' || /column .* does not exist/i.test(e.message ?? '')
}

// PG 42P01 / PostgREST PGRST205 "Could not find the table ... in the schema cache".
export function isMissingRelation(e: PgErr): boolean {
  if (!e) return false
  return (
    e.code === 'PGRST205' ||
    e.code === '42P01' ||
    /could not find the table|relation .* does not exist/i.test(e.message ?? '')
  )
}

// Backfill the 0005/0006 fields on a row that came from a base-columns fallback.
export function withAvatarDefaults<T extends Record<string, unknown>>(row: T | null): T | null {
  if (!row) return row
  const out: Record<string, unknown> = { ...row }
  for (const k of AVATAR_EXT_KEYS) if (out[k] === undefined) out[k] = AVATAR_EXT_DEFAULTS[k]
  return out as T
}
