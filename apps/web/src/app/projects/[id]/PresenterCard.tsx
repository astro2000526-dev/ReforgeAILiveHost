'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/components/LocaleProvider'
import type { Avatar as AvatarRow } from '@/lib/types'

type Avatar = Pick<AvatarRow, 'id' | 'name' | 'preview_image_url' | 'region' | 'gender'>

export function PresenterCard({
  projectId,
  current,
}: {
  projectId: string
  current: Avatar | null
}) {
  const router = useRouter()
  const { t } = useI18n()

  const [avatars, setAvatars] = useState<Avatar[]>([])
  const [selected, setSelected] = useState(current?.id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/avatars', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { avatars: Avatar[] }) => setAvatars(d.avatars ?? []))
      .catch(() => {})
  }, [])

  async function change() {
    if (!selected || selected === current?.id) return
    setSaving(true)
    setError(null)
    try {
      const r = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_id: selected }),
      })
      const data = (await r.json()) as { error?: string }
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('proj.avatar')}</CardTitle>
      </CardHeader>
      <CardContent>
        {current?.preview_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current.preview_image_url}
            alt={current.name ?? ''}
            className="mb-3 aspect-[2/3] w-full rounded-md object-cover"
          />
        ) : (
          <div className="mb-3 flex aspect-[2/3] w-full items-center justify-center rounded-md bg-muted text-3xl text-muted-foreground">
            🎭
          </div>
        )}
        <p className="text-sm font-medium">{current?.name ?? '—'}</p>
        <p className="text-xs text-muted-foreground">
          {current?.region ?? '?'} · {current?.gender ?? '?'}
        </p>

        <div className="mt-4 space-y-2 border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground">{t('proj.changePresenter')}</p>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {avatars.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.region ?? '?'})
              </option>
            ))}
          </select>
          {error && <p className="text-xs text-destructive break-all">{error}</p>}
          <Button
            size="sm"
            className="w-full"
            disabled={saving || !selected || selected === current?.id}
            onClick={change}
          >
            {saving ? t('proj.changing') : t('proj.change')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
