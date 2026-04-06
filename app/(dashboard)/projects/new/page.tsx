import { createProject } from '@/app/actions/projects'
import NewProjectForm from './NewProjectForm'

export default function NewProjectPage() {
  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">New project</h1>
      <p className="text-gray-500 mb-8">Create a new construction project to track its programme and progress.</p>
      <div className="bg-white rounded-2xl border border-gray-200 p-8">
        <NewProjectForm action={createProject} />
      </div>
    </div>
  )
}
