'use client'

import { useEffect, useRef } from 'react'

import styles from './landing.module.css'

// Gold scroll-progress bar pinned to the very top of the viewport. Width tracks
// how far the document is scrolled. Passive listener + rAF coalescing keep it
// cheap.
export function ScrollProgress() {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let ticking = false

    function update() {
      ticking = false
      const doc = document.documentElement
      const max = doc.scrollHeight - window.innerHeight
      const pct = max > 0 ? (window.scrollY / max) * 100 : 0
      el!.style.width = `${pct}%`
    }
    function onScroll() {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(update)
      }
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return <div ref={ref} className={styles.scrollProgress} aria-hidden />
}
