'use client'

import { useTransition } from 'react'
import { completeSetup } from '@/app/actions/setup'

export default function SetupBanner({ projectId }: { projectId: string }) {
  const [isPending, startTransition] = useTransition()

  function handleDone() {
    startTransition(async () => {
      await completeSetup(projectId)
    })
  }

  return (
    <div className="flex items-center justify-between px-6 py-3 bg-indigo-50 border-b border-indigo-200 flex-shrink-0">
      <div>
        <p className="text-sm font-semibold text-indigo-900">Set up your project plan</p>
        <p className="text-xs text-indigo-500 mt-0.5">
          Edit phases and tasks below — changes save automatically. Come back any time to continue.
        </p>
      </div>
      <button
        onClick={handleDone}
        disabled={isPending}
        className="ml-6 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
      >
        {isPending ? 'Opening…' : 'Open Gantt →'}
      </button>
    </div>
  )
}
