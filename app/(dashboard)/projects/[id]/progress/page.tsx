export default async function Page(props: { params: Promise<{ id: string }> }) {
  await props.params
  return (
    <div className="p-8 text-center py-24 text-gray-400">
      <p className="text-lg">Coming in a later stage</p>
    </div>
  )
}
