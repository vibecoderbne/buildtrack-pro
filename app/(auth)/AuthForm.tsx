'use client'

import React, { useActionState } from 'react'

type ActionFn = (formData: FormData) => Promise<{ error: string } | void>

export default function AuthForm({
  action,
  submitLabel,
  showName = false,
}: {
  action: ActionFn
  submitLabel: string
  showName?: boolean
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: { error: string } | null, formData: FormData) => {
      const result = await action(formData)
      return result ?? null
    },
    null
  )

  const inputClass = 'w-full rounded px-3 py-2 text-sm focus:outline-none'
  const inputStyle: React.CSSProperties = {
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--ink)',
  }

  return (
    <form action={formAction} className="space-y-5">
      {showName && (
        <div>
          <label htmlFor="full_name" className="block text-sm font-medium mb-1" style={{ color: 'var(--ink-2)' }}>
            Full name
          </label>
          <input
            id="full_name"
            name="full_name"
            type="text"
            required
            className={inputClass}
            style={inputStyle}
            placeholder="Jane Smith"
          />
        </div>
      )}

      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1" style={{ color: 'var(--ink-2)' }}>
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={inputClass}
          style={inputStyle}
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-1" style={{ color: 'var(--ink-2)' }}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          className={inputClass}
          style={inputStyle}
          placeholder="••••••••"
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
        {pending ? 'Please wait…' : submitLabel}
      </button>
    </form>
  )
}
