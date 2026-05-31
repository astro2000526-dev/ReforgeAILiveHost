// Shared system config types + defaults (no server-only imports — safe for client components)

export type SystemConfig = {
  tts_provider: 'edge-tts' | 'azure' | 'volcengine'
  tts_voice: string
  lipsync_enabled: boolean
  lipsync_model: 'mock' | 'musetalk' | 'wav2lip'
  lipsync_url: string
  render_mode: 'loop' | 'ai'
  voice_clone: boolean
  playback_speed: number
  video_quality: '1080p' | '720p' | '480p'
  sound_mode: 'normal' | 'boost' | 'soft'
  lip_blend: number          // 0..100 — feather the lip-sync crop edge (ความเนียน)
  default_rtmp_url: string
  default_duration: number
}

export const SYSTEM_CONFIG_DEFAULTS: SystemConfig = {
  tts_provider: 'edge-tts',
  tts_voice: 'th-TH-PremwadeeNeural',
  lipsync_enabled: false,
  lipsync_model: 'mock',
  lipsync_url: 'http://127.0.0.1:8001',
  render_mode: 'loop',
  voice_clone: false,
  playback_speed: 1.0,
  video_quality: '1080p',
  sound_mode: 'normal',
  lip_blend: 30,
  default_rtmp_url: 'rtmps://live-api-s.facebook.com:443/rtmp/',
  default_duration: 30,
}
