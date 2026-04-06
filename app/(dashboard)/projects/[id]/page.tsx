import { redirect } from 'next/navigation'

// The project root redirects straight to the Programme tab
export default async function ProjectPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  redirect(`/projects/${id}/programme`)
}
