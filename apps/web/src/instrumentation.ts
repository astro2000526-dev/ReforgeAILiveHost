// Runs once when the Next.js server boots (file convention: instrumentation.ts).
// Resumes any server-side loop that was running before a restart — the run flag
// + settings are persisted in the system_config table:
//   - gallery auto news-clip loop (gallery_loop_v1)
//   - 24/7 live-stream driver loop (live_loop_v1)

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { resumeLoopIfNeeded } = await import('@/lib/gallery-loop')
    void resumeLoopIfNeeded()
    const { resumeLiveLoopIfNeeded } = await import('@/lib/live-loop')
    void resumeLiveLoopIfNeeded()
  }
}
