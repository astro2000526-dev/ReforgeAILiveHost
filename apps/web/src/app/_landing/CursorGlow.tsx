'use client'

import { useEffect, useRef } from 'react'

import styles from './landing.module.css'

// Cursor-follow gold glow (mix-blend screen) for the dark canvas. Eased toward
// the pointer with rAF. Disabled on touch / coarse pointers and when the user
// prefers reduced motion. The glow is only shown while the pointer is over a
// landing section (the whole page is dark, so it stays active throughout).
export function CursorGlow() {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const fine = window.matchMedia('(pointer: fine)').matches
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!fine || reduce) return

    let mouseX = window.innerWidth / 2
    let mouseY = window.innerHeight / 2
    let glowX = mouseX
    let glowY = mouseY
    let raf = 0
    let active = false

    function onMove(e: MouseEvent) {
      mouseX = e.clientX
      mouseY = e.clientY
      if (!active) {
        active = true
        el!.classList.add(styles.cursorGlowActive)
      }
    }
    function onLeave() {
      active = false
      el!.classList.remove(styles.cursorGlowActive)
    }
    function tick() {
      glowX += (mouseX - glowX) * 0.12
      glowY += (mouseY - glowY) * 0.12
      el!.style.transform = `translate(${glowX}px, ${glowY}px) translate(-50%, -50%)`
      raf = requestAnimationFrame(tick)
    }

    document.addEventListener('mousemove', onMove, { passive: true })
    document.addEventListener('mouseleave', onLeave)
    raf = requestAnimationFrame(tick)

    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onLeave)
      cancelAnimationFrame(raf)
    }
  }, [])

  return <div ref={ref} className={styles.cursorGlow} aria-hidden />
}
