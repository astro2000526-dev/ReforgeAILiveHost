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
  azure_speech_key: string   // Azure Speech key (blank = use offline MMS-TTS)
  azure_speech_region: string
  default_rtmp_url: string
  default_duration: number
  fb_page_token: string      // Facebook Page access token (for reading live comments + posting replies)
  fb_live_video_id: string   // Facebook live video id to poll comments from
  brave_api_key: string      // Brave Search API key for gallery news fetch (blank = Google News RSS)
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
  azure_speech_key: '',
  azure_speech_region: 'eastus',
  default_rtmp_url: 'rtmps://live-api-s.facebook.com:443/rtmp/',
  default_duration: 30,
  fb_page_token: '',
  fb_live_video_id: '',
  brave_api_key: '',
}

// Preview-mask an API key for display: keep the last 5 chars, hide the rest
// with ***; when more than 10 chars are hidden, prefix the hidden count.
//   'abc12345678901234' → '(12)***34567' ;  'short1' → '***hort1'
export function maskKey(v: string): string {
  if (!v) return ''
  const tail = v.slice(-5)
  const hidden = Math.max(0, v.length - tail.length)
  return (hidden > 10 ? `(${hidden})***` : '***') + tail
}
