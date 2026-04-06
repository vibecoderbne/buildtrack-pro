'use client'

import { useActionState } from 'react'

type ActionFn = (formData: FormData) => Promise<{ error: string } | void>

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
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
          Company name <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          placeholder="Smith Building Co"
        />
      </div>

      <div>
        <label htmlFor="abn" className="block text-sm font-medium text-gray-700 mb-1">
          ABN
          <span className="ml-1 text-xs text-gray-400">(optional)</span>
        </label>
        <input
          id="abn"
          name="abn"
          type="text"
          inputMode="numeric"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          placeholder="12 345 678 901"
        />
      </div>

      <div>
        <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
          Business address
          <span className="ml-1 text-xs text-gray-400">(optional)</span>
        </label>
        <input
          id="address"
          name="address"
          type="text"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          placeholder="123 Example St, Melbourne VIC 3000"
        />
      </div>

      {state?.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {pending ? 'Creating…' : 'Create organisation'}
      </button>
    </form>
  )
}
