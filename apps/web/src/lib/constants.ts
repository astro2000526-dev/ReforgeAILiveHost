// Shared enum-like constants used by avatar UI + avatar API validation.
// Kept as `as const` so callers can derive string-literal unions if needed.

export const REGIONS = ['TH', 'ID', 'VN', 'MY', 'CN', 'EN'] as const
export const GENDERS = ['female', 'male', 'other'] as const
export const BG_TYPES = ['image', 'video'] as const

// 9-grid presenter anchor inside the frame (row-major, renders as a 3×3 picker).
export const FRAME_POSITIONS = [
  'top-left', 'top', 'top-right',
  'left', 'center', 'right',
  'bottom-left', 'bottom', 'bottom-right',
] as const
export type FramePosition = (typeof FRAME_POSITIONS)[number]
