import { createProject } from '@/app/actions/projects'
import NewProjectForm from './NewProjectForm'

export default function NewProjectPage() {
  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--ink)' }}>New project</h1>
      <p className="mb-8" style={{ color: 'var(--ink-3)' }}>Create a new construction project to track its programme and progress.</p>
      <div className="rounded-xl p-8" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <NewProjectForm action={createProject} />
      </div>
    </div>
  )
}
