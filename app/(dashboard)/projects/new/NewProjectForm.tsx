'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import type { JobType } from '@/lib/types'

type ActionFn = (formData: FormData) => Promise<{ error: string } | void>
type Step = 'type' | 'cost_config' | 'details'

const inputStyle = {
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--ink)',
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function DocumentIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  )
}

function ReceiptIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2v20l3-2 2 2 3-2 2 2 3-2 3 2V2" />
      <line x1="8" y1="8" x2="16" y2="8" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="16" x2="12" y2="16" />
    </svg>
  )
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
            style={
              i + 1 === current
                ? { background: 'var(--accent)', color: '#fff' }
                : i + 1 < current
                ? { background: 'var(--ok)', color: '#fff' }
                : { background: 'var(--surface-2)', color: 'var(--ink-3)' }
            }
          >
            {i + 1 < current ? '✓' : i + 1}
          </div>
          {i < total - 1 && (
            <div className="w-8 h-px" style={{ background: i + 1 < current ? 'var(--ok)' : 'var(--border)' }} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NewProjectForm({ action }: { action: ActionFn }) {
  const [step, setStep] = useState<Step>('type')
  const [jobType, setJobType] = useState<JobType | null>(null)
  const [costConfig, setCostConfig] = useState({
    labour_markup_percent: '0',
    materials_markup_percent: '0',
    default_hourly_rate: '',
    default_daily_rate: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const totalSteps = jobType === 'cost_plus' ? 3 : 2
  const currentStep = step === 'type' ? 1 : step === 'cost_config' ? 2 : totalSteps

  // ── Step 1: Job type selection ─────────────────────────────────────────────
  if (step === 'type') {
    return (
      <div className="space-y-6">
        <StepIndicator current={1} total={jobType === 'cost_plus' ? 3 : 2} />

        <div>
          <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--ink)' }}>Select job type</h2>
          <p className="text-sm" style={{ color: 'var(--ink-3)' }}>Choose how this project is contracted and billed.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Fixed Price card */}
          <button
            type="button"
            onClick={() => setJobType('fixed_price')}
            className="text-left rounded-xl p-5 transition-all"
            style={{
              border: jobType === 'fixed_price' ? '2px solid var(--accent)' : '2px solid var(--border)',
              background: jobType === 'fixed_price' ? 'var(--accent-soft, #eff6ff)' : 'var(--surface)',
            }}
          >
            <div className="mb-3" style={{ color: jobType === 'fixed_price' ? 'var(--accent)' : 'var(--ink-3)' }}>
              <DocumentIcon />
            </div>
            <div className="font-semibold mb-1" style={{ color: 'var(--ink)' }}>Fixed Price</div>
            <div className="text-xs leading-relaxed" style={{ color: 'var(--ink-3)' }}>
              Lump sum contract. Work is broken into phases and tasks. Progress is claimed as a % of contract value.
            </div>
          </button>

          {/* Cost Plus card */}
          <button
            type="button"
            onClick={() => setJobType('cost_plus')}
            className="text-left rounded-xl p-5 transition-all"
            style={{
              border: jobType === 'cost_plus' ? '2px solid var(--accent)' : '2px solid var(--border)',
              background: jobType === 'cost_plus' ? 'var(--accent-soft, #eff6ff)' : 'var(--surface)',
            }}
          >
            <div className="mb-3" style={{ color: jobType === 'cost_plus' ? 'var(--accent)' : 'var(--ink-3)' }}>
              <ReceiptIcon />
            </div>
            <div className="font-semibold mb-1" style={{ color: 'var(--ink)' }}>Cost Plus</div>
            <div className="text-xs leading-relaxed" style={{ color: 'var(--ink-3)' }}>
              No fixed contract sum. Bill actual labour hours and trade/materials invoices, plus a markup. Each claim period is a sum of costs incurred.
            </div>
          </button>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            disabled={!jobType}
            onClick={() => setStep(jobType === 'cost_plus' ? 'cost_config' : 'details')}
            className="rounded px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            style={{ background: 'var(--accent)' }}
          >
            Next
          </button>
          <Link
            href="/dashboard"
            className="rounded px-5 py-2.5 text-sm font-semibold transition-colors"
            style={{ border: '1px solid var(--border)', color: 'var(--ink-2)' }}
          >
            Cancel
          </Link>
        </div>
      </div>
    )
  }

  // ── Step 2 (Cost Plus only): Markup & rates config ─────────────────────────
  if (step === 'cost_config') {
    return (
      <div className="space-y-6">
        <StepIndicator current={2} total={3} />

        <div>
          <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--ink)' }}>Markup & rates</h2>
          <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
            Set default markup percentages and labour rates. You can change these later in project settings.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--ink-2)' }}>
              Labour markup %
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={costConfig.labour_markup_percent}
              onChange={e => setCostConfig(p => ({ ...p, labour_markup_percent: e.target.value }))}
              className="w-full rounded px-3 py-2 text-sm focus:outline-none"
              style={inputStyle}
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--ink-2)' }}>
              Materials & trades markup %
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={costConfig.materials_markup_percent}
              onChange={e => setCostConfig(p => ({ ...p, materials_markup_percent: e.target.value }))}
              className="w-full rounded px-3 py-2 text-sm focus:outline-none"
              style={inputStyle}
              placeholder="0"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--ink-2)' }}>
              Default hourly rate (AUD)
              <span className="ml-1 font-normal" style={{ color: 'var(--ink-4)' }}>optional</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={costConfig.default_hourly_rate}
              onChange={e => setCostConfig(p => ({ ...p, default_hourly_rate: e.target.value }))}
              className="w-full rounded px-3 py-2 text-sm focus:outline-none"
              style={inputStyle}
              placeholder="e.g. 85.00"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--ink-2)' }}>
              Default daily rate (AUD)
              <span className="ml-1 font-normal" style={{ color: 'var(--ink-4)' }}>optional</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={costConfig.default_daily_rate}
              onChange={e => setCostConfig(p => ({ ...p, default_daily_rate: e.target.value }))}
              className="w-full rounded px-3 py-2 text-sm focus:outline-none"
              style={inputStyle}
              placeholder="e.g. 680.00"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => setStep('details')}
            className="rounded px-5 py-2.5 text-sm font-semibold text-white transition-colors"
            style={{ background: 'var(--accent)' }}
          >
            Next
          </button>
          <button
            type="button"
            onClick={() => setStep('type')}
            className="rounded px-5 py-2.5 text-sm font-semibold transition-colors"
            style={{ border: '1px solid var(--border)', color: 'var(--ink-2)' }}
          >
            Back
          </button>
        </div>
      </div>
    )
  }

  // ── Step 3: Project details ────────────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    formData.set('job_type', jobType ?? 'fixed_price')
    if (jobType === 'cost_plus') {
      formData.set('labour_markup_percent', costConfig.labour_markup_percent || '0')
      formData.set('materials_markup_percent', costConfig.materials_markup_percent || '0')
      if (costConfig.default_hourly_rate) formData.set('default_hourly_rate', costConfig.default_hourly_rate)
      if (costConfig.default_daily_rate) formData.set('default_daily_rate', costConfig.default_daily_rate)
    }
    startTransition(async () => {
      const result = await action(formData)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <StepIndicator current={currentStep} total={totalSteps} />

      <div>
        <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--ink)' }}>Project details</h2>
        {jobType === 'cost_plus' && (
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium mt-1"
            style={{ background: 'var(--accent-soft, #eff6ff)', color: 'var(--accent)' }}
          >
            Cost Plus
          </div>
        )}
      </div>

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
        <p className="mt-1 text-xs" style={{ color: 'var(--ink-4)' }}>
          Typically the site address — how you&apos;ll identify this project
        </p>
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

      {error && (
        <div
          className="rounded px-4 py-3 text-sm"
          style={{ background: 'var(--bad-soft)', border: '1px solid var(--bad)', color: 'var(--bad)' }}
        >
          {error}
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
        <button
          type="button"
          onClick={() => setStep(jobType === 'cost_plus' ? 'cost_config' : 'type')}
          className="rounded px-5 py-2.5 text-sm font-semibold transition-colors"
          style={{ border: '1px solid var(--border)', color: 'var(--ink-2)' }}
        >
          Back
        </button>
      </div>
    </form>
  )
}
