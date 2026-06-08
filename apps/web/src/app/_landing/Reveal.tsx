'use client'

import { useEffect, useRef, type ElementType, type ReactNode } from 'react'

import styles from './landing.module.css'

type RevealProps = {
  children: ReactNode
  /** stagger delay step: 1 | 2 | 3 */
  delay?: 1 | 2 | 3
  /** render element (default div) — e.g. "section", "figure" */
  as?: ElementType
  className?: string
}

const DELAY: Record<number, string> = {
  1: styles.delay1,
  2: styles.delay2,
  3: styles.delay3,
}

// Reveal-on-scroll wrapper. Adds the in-view class once the element enters the
// viewport, then unobserves. If IntersectionObserver is unavailable (or reduced
// motion), the content is shown immediately via the CSS fallback.
export function Reveal({ children, delay, as, className }: RevealProps) {
  const Tag = (as ?? 'div') as ElementType
  const ref = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add(styles.revealIn)
      return
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.revealIn)
            obs.unobserve(entry.target)
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -60px 0px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const cls = [styles.reveal, delay ? DELAY[delay] : '', className].filter(Boolean).join(' ')

  return (
    <Tag ref={ref} className={cls}>
      {children}
    </Tag>
  )
}
