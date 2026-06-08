'use client'

// Masked API-key field for Settings. Saved keys preview as e.g. '(27)***ab3Fk'
// (last 5 chars visible, hidden-count prefix when >10 chars hidden) instead of
// the full secret. "Change" swaps to a live input; "✕ cancel" restores the
// previous value; the trash button clears the key.

import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { maskKey } from '@/lib/system-config'

type Props = {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  changeLabel: string
  cancelLabel: string
}

export function KeyInput({ value, onChange, placeholder, changeLabel, cancelLabel }: Props) {
  const [editing, setEditing] = useState(false)
  const prevRef = useRef('')

  if (value && !editing) {
    return (
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-md border border-input bg-muted/40 px-3 py-2 font-mono text-xs">
          {maskKey(value)}
        </code>
        <Button type="button" variant="outline" size="sm"
          onClick={() => { prevRef.current = value; onChange(''); setEditing(true) }}>
          {changeLabel}
        </Button>
        <Button type="button" variant="ghost" size="sm" aria-label="Clear key"
          className="text-red-500 hover:text-red-700 hover:bg-red-50"
          onClick={() => onChange('')}>
          🗑
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Input autoComplete="off" autoFocus={editing} placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value.trim())} />
      {editing && (
        <Button type="button" variant="ghost" size="sm"
          onClick={() => { onChange(prevRef.current); setEditing(false) }}>
          ✕ {cancelLabel}
        </Button>
      )}
    </div>
  )
}
