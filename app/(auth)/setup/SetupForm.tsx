'use client'

import { useActionState } from 'react'

type ActionFn = (formData: FormData) => Promise<{ error: string } | void>

const inputStyle = {
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--ink)',
}

export default function SetupForm({ action }: { action: ActionFn }) {
  const [state, formAction, pending] = useActionState(
    async (_prev: { error: string } | null, formData: FormData) => {
      const result = await action(formData)
      return result ?? null
    },
    null
  )

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label htmlFor="name" className="block text-sm font-medium mb-1" style={{ color: 'var(--ink-2)' }}>
          Company name <span style={{ color: 'var(--bad)' }}>*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          className="w-full rounded px-3 py-2 text-sm focus:outline-none"
          style={inputStyle}
          placeholder="Smith Building Co"
        />
      </div>

      <div>
        <label htmlFor="abn" className="block text-sm font-medium mb-1" style={{ color: 'var(--ink-2)' }}>
          ABN
          <span className="ml-1 text-xs" style={{ color: 'var(--ink-4)' }}>(optional)</span>
        </label>
        <input
          id="abn"
          name="abn"
          type="text"
          inputMode="numeric"
          className="w-full rounded px-3 py-2 text-sm focus:outline-none"
          style={inputStyle}
          placeholder="12 345 678 901"
        />
      </div>

      <div>
        <label htmlFor="address" className="block text-sm font-medium mb-1" style={{ color: 'var(--ink-2)' }}>
          Business address
          <span className="ml-1 text-xs" style={{ color: 'var(--ink-4)' }}>(optional)</span>
        </label>
        <input
          id="address"
          name="address"
          type="text"
          className="w-full rounded px-3 py-2 text-sm focus:outline-none"
          style={inputStyle}
          placeholder="123 Example St, Melbourne VIC 3000"
        />
      </div>

      {state?.error && (
        <div className="rounded px-4 py-3 text-sm" style={{ background: 'var(--bad-soft)', border: '1px solid var(--bad)', color: 'var(--bad)' }}>
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        style={{ background: 'var(--accent)' }}
      >
        {pending ? 'Creating…' : 'Create organisation'}
      </button>
    </form>
  )
}
