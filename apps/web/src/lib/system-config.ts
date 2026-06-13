// Shared system config types + defaults (no server-only imports — safe for client components)

// A saved RTMP push target. The pipeline only needs rtmp_url + stream_key; the
// platform/label are presentation-only so the user can tell destinations apart
// in the Live Console picker.
export type StreamPlatform = 'tiktok' | 'facebook' | 'youtube' | 'shopee' | 'custom'

export type StreamDestination = {
  id: string
  platform: StreamPlatform
  label: string
  rtmp_url: string
  stream_key: string
}

// Per-platform metadata: display name + RTMP server template. TikTok / Shopee
// hand out a fresh ingest URL per session (from LIVE Studio / Seller Centre), so
// their url is left blank for the user to paste. Facebook / YouTube are stable.
export const STREAM_PLATFORMS: Record<StreamPlatform, { label: string; rtmpUrl: string; keyHint: string }> = {
  tiktok:   { label: 'TikTok LIVE',   rtmpUrl: '',                                             keyHint: 'จาก TikTok LIVE Studio → Stream → third-party (Server URL + Stream Key)' },
  facebook: { label: 'Facebook Live', rtmpUrl: 'rtmps://live-api-s.facebook.com:443/rtmp/',    keyHint: 'จาก Facebook Live Producer → Streaming software' },
  youtube:  { label: 'YouTube Live',  rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2/',              keyHint: 'จาก YouTube Studio → Go Live → Stream key' },
  shopee:   { label: 'Shopee Live',   rtmpUrl: '',                                             keyHint: 'จาก Shopee Seller Centre / Shopee LIVE app' },
  custom:   { label: 'กำหนดเอง',       rtmpUrl: '',                                             keyHint: 'วาง RTMP URL + key ของปลายทางใดก็ได้' },
}

export type SystemConfig = {
  tts_provider: 'edge-tts' | 'azure' | 'google' | 'volcengine'
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
  google_tts_key: string     // Google Cloud TTS API key (blank = use offline MMS-TTS)
  default_rtmp_url: string
  default_duration: number
  stream_destinations: StreamDestination[]  // saved RTMP push targets (TikTok / FB / YouTube / Shopee / custom)
  fb_page_token: string      // Facebook Page access token (for reading live comments + posting replies)
  fb_live_video_id: string   // Facebook live video id to poll comments from
  brave_api_key: string      // Brave Search API key for gallery news fetch (blank = Google News RSS)
  sovits_enabled: boolean    // GPT-SoVITS high-quality TTS (sovits-first chain); off = current TTS
  sovits_url: string         // GPT-SoVITS HTTP service URL (blank = pipeline env default)
  tts_pitch: number          // semitones -12..12 (sovits)
  tts_emotion: string        // emotion tag (sovits, best-effort; blank = neutral)
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
  google_tts_key: '',
  default_rtmp_url: 'rtmps://live-api-s.facebook.com:443/rtmp/',
  default_duration: 30,
  stream_destinations: [],
  fb_page_token: '',
  fb_live_video_id: '',
  brave_api_key: '',
  sovits_enabled: false,
  sovits_url: '',
  tts_pitch: 0,
  tts_emotion: '',
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
