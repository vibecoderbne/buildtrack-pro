import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getHomeownerDashboard } from '@/app/actions/homeowner'
import HomeownerDashboardView from '@/app/components/HomeownerDashboardView'

export default async function HomeownerPage(props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .single()

  if (!project) notFound()

  const data = await getHomeownerDashboard(projectId)

  return <HomeownerDashboardView data={data} supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''} />
}
