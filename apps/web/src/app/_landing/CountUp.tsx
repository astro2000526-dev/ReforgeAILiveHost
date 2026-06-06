'use client'

import { useEffect, useRef, useState } from 'react'

type CountUpProps = {
  /** final value to count to */
  to: number
  /** appended after the number (e.g. " คน", "%") */
  suffix?: string
  /** thousands-separated when true (default true) */
  group?: boolean
  /** decimal places to keep (default 0) */
  decimals?: number
}

// Tiny count-up: animates 0 → `to` once the element scrolls into view, then a
// gentle pulse re-fires the count on a loop so the "live" number keeps feeling
// alive. Respects prefers-reduced-motion (renders the final value immediately,
// no animation, no loop). SSR renders the final value so there's no layout
// shift / hydration mismatch.
export function CountUp({ to, suffix = '', group = true, decimals = 0 }: CountUpProps) {
  const ref = useRef<HTMLSpanElement | null>(null)
  const [val, setVal] = useState(to)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || typeof IntersectionObserver === 'undefined') {
      // initial state already equals `to` (SSR-rendered) — nothing to animate
      return
    }

    let raf = 0
    let loopTimer: ReturnType<typeof setTimeout> | undefined

    function run(duration = 1400) {
      const start = performance.now()
      cancelAnimationFrame(raf)
      function tick(now: number) {
        const t = Math.min(1, (now - start) / duration)
        // easeOutCubic
        const eased = 1 - Math.pow(1 - t, 3)
        setVal(to * eased)
        if (t < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }

    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            run()
            // re-pulse the count every ~6s so it reads as "live"
            loopTimer = setInterval(() => run(900), 6000)
            obs.unobserve(entry.target)
          }
        }
      },
      { threshold: 0.4 },
    )
    obs.observe(el)

    return () => {
      cancelAnimationFrame(raf)
      if (loopTimer) clearInterval(loopTimer)
      obs.disconnect()
    }
  }, [to])

  const rounded =
    decimals > 0 ? Number(val.toFixed(decimals)) : Math.round(val)
  const text = group ? rounded.toLocaleString('en-US') : String(rounded)

  return (
    <span ref={ref}>
      {text}
      {suffix}
    </span>
  )
}
