export default async function Page(props: { params: Promise<{ id: string }> }) {
  await props.params
  return (
    <div className="p-8 text-center py-24" style={{ color: 'var(--ink-4)' }}>
      <p className="text-lg">Coming in a later stage</p>
    </div>
  )
}
