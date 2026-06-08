// Shared client/server-safe data shapes (no server-only imports).
//
// These mirror the columns the `/api/avatars` routes select + the inline shapes
// that several pages/routes had duplicated. The nullness is the widest union
// that satisfies every current call site, so a page can either use `Avatar`
// directly or narrow with `Pick<Avatar, ...>` when it selects fewer columns.

// Full avatar row as returned by the avatars API (all selected columns).
export type Avatar = {
  id: string
  name: string | null
  preview_image_url: string | null
  template_video_url: string | null
  region: string | null
  gender: string | null
  description: string | null
  display_order?: number | null
  is_active?: boolean | null
  bg_remove?: boolean | null
  background_url?: string | null
  background_type?: string | null
  camera_zoom?: number | null
  frame_position?: string | null
  frame_scale?: number | null
}

// One curated question/answer pair inside a reply preset.
export type QAPair = {
  q: string
  a: string
}

// AI comment-reply preset row as returned by the /api/reply-presets routes.
export type ReplyPreset = {
  id: string
  name: string
  instruction: string
  data: string
  qa: QAPair[]
  is_active?: boolean | null
  created_at?: string | null
  updated_at?: string | null
}

// A single script segment (TTS-able line).
export type Segment = {
  type: string
  text: string
  duration_sec?: number
}

// The avatar columns joined into a project row for rendering (no id/name —
// just the render-relevant fields). Matches the render route's PostgREST join.
export type AvatarJoin = {
  template_video_url: string | null
  preview_image_url: string | null
  bg_remove: boolean | null
  background_url: string | null
  background_type: string | null
  camera_zoom: number | null
  frame_position: string | null
  frame_scale: number | null
}
