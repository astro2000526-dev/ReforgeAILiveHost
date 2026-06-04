// Runs once when the Next.js server boots (file convention: instrumentation.ts).
// Resumes the gallery auto news-clip loop if it was running before a restart —
// the run flag + settings are persisted in the system_config table.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { resumeLoopIfNeeded } = await import('@/lib/gallery-loop')
    void resumeLoopIfNeeded()
  }
}
