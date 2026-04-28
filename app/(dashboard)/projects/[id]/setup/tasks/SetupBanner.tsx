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
    <div
      className="flex items-center justify-between px-6 py-3 flex-shrink-0"
      style={{ background: 'var(--accent-soft)', borderBottom: '1px solid var(--warn-soft)' }}
    >
      <div>
        <p className="text-sm font-semibold" style={{ color: 'var(--accent-ink)' }}>Set up your project plan</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--accent)' }}>
          Edit phases and tasks below — changes save automatically. Come back any time to continue.
        </p>
      </div>
      <button
        onClick={handleDone}
        disabled={isPending}
        className="ml-6 px-4 py-2 text-sm font-medium text-white rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        style={{ background: 'var(--accent)' }}
      >
        {isPending ? 'Opening…' : 'Open Gantt →'}
      </button>
    </div>
  )
}
