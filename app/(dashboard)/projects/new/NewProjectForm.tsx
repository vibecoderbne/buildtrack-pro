'use client'

import { useActionState } from 'react'
import Link from 'next/link'

type ActionFn = (formData: FormData) => Promise<{ error: string } | void>

const inputStyle = {
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--ink)',
}

export default function NewProjectForm({ action }: { action: ActionFn }) {
  const [state, formAction, pending] = useActionState(
    async (_prev: { error: string } | null, formData: FormData) => {
      const result = await action(formData)
      return result ?? null
    },
    null
  )

  return (
    <form action={formAction} className="space-y-6">
      <div>
        <label htmlFor="name" className="block text-sm font-medium mb-1" style={{ color: 'var(--ink-2)' }}>
          Project name <span style={{ color: 'var(--bad)' }}>*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          className="w-full rounded px-3 py-2 text-sm focus:outline-none"
          style={inputStyle}
          placeholder="42 Smith St, Richmond"
        />
        <p className="mt-1 text-xs" style={{ color: 'var(--ink-4)' }}>Typically the site address — how you&apos;ll identify this project</p>
      </div>

      <div>
        <label htmlFor="address" className="block text-sm font-medium mb-1" style={{ color: 'var(--ink-2)' }}>
          Site address <span style={{ color: 'var(--bad)' }}>*</span>
        </label>
        <input
          id="address"
          name="address"
          type="text"
          required
          className="w-full rounded px-3 py-2 text-sm focus:outline-none"
          style={inputStyle}
          placeholder="42 Smith St, Richmond VIC 3121"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="start_date" className="block text-sm font-medium mb-1" style={{ color: 'var(--ink-2)' }}>
            Programme start <span style={{ color: 'var(--bad)' }}>*</span>
          </label>
          <input
            id="start_date"
            name="start_date"
            type="date"
            required
            className="w-full rounded px-3 py-2 text-sm focus:outline-none"
            style={inputStyle}
          />
        </div>

        <div>
          <label htmlFor="target_completion" className="block text-sm font-medium mb-1" style={{ color: 'var(--ink-2)' }}>
            Target completion
          </label>
          <input
            id="target_completion"
            name="target_completion"
            type="date"
            className="w-full rounded px-3 py-2 text-sm focus:outline-none"
            style={inputStyle}
          />
        </div>
      </div>

      {state?.error && (
        <div className="rounded px-4 py-3 text-sm" style={{ background: 'var(--bad-soft)', border: '1px solid var(--bad)', color: 'var(--bad)' }}>
          {state.error}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          style={{ background: 'var(--accent)' }}
        >
          {pending ? 'Creating…' : 'Create project'}
        </button>
        <Link
          href="/dashboard"
          className="rounded px-5 py-2.5 text-sm font-semibold transition-colors"
          style={{ border: '1px solid var(--border)', color: 'var(--ink-2)' }}
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}
