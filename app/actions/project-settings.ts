'use server'

import { refresh } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function updateCostPlusSettings(projectId: string, data: {
  labour_markup_percent: number
  materials_markup_percent: number
  default_hourly_rate: number | null
  default_daily_rate: number | null
}): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const { error } = await supabase
    .from('projects')
    .update({
      labour_markup_percent:    data.labour_markup_percent,
      materials_markup_percent: data.materials_markup_percent,
      default_hourly_rate:      data.default_hourly_rate,
      default_daily_rate:       data.default_daily_rate,
    })
    .eq('id', projectId)

  if (error) throw new Error(error.message)
  refresh()
}
