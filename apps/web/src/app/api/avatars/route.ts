// GET /api/avatars — list active avatars for the wizard's step 1.

import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/supabase-server'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('avatars')
    .select('id, name, preview_image_url, region, gender, display_order')
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ avatars: data ?? [] })
}
