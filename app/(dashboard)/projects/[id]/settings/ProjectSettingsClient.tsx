'use client'

import { useState, useTransition } from 'react'
import { updateCostPlusSettings } from '@/app/actions/project-settings'

const inputStyle = {
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--ink)',
}

export default function ProjectSettingsClient({
  projectId,
  jobType,
  labourMarkupPercent,
  materialsMarkupPercent,
  defaultHourlyRate,
  defaultDailyRate,
}: {
  projectId: string
  jobType: string
  labourMarkupPercent: number
  materialsMarkupPercent: number
  defaultHourlyRate: number | null
  defaultDailyRate: number | null
}) {
  const [form, setForm] = useState({
    labour_markup_percent:    String(labourMarkupPercent),
    materials_markup_percent: String(materialsMarkupPercent),
    default_hourly_rate:      defaultHourlyRate != null ? String(defaultHourlyRate) : '',
    default_daily_rate:       defaultDailyRate  != null ? String(defaultDailyRate)  : '',
  })
  const [pending, startTransition] = useTransition()
  const [saved,   setSaved]        = useState(false)
  const [error,   setError]        = useState<string | null>(null)

  const handleSave = () => {
    setError(null)
    startTransition(async () => {
      try {
        await updateCostPlusSettings(projectId, {
          labour_markup_percent:    parseFloat(form.labour_markup_percent)    || 0,
          materials_markup_percent: parseFloat(form.materials_markup_percent) || 0,
          default_hourly_rate:      form.default_hourly_rate  ? parseFloat(form.default_hourly_rate)  : null,
          default_daily_rate:       form.default_daily_rate   ? parseFloat(form.default_daily_rate)   : null,
        })
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed.')
      }
    })
  }

  if (jobType !== 'cost_plus') {
    return (
      <div className="rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <p className="text-sm" style={{ color: 'var(--ink-3)' }}>No additional settings for Fixed Price projects.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl p-6 space-y-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div>
        <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--ink)' }}>Markup percentages</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--ink-3)' }}>
          Applied to claims going forward. Changing these does not affect historical claims — each claim snapshots the markup at generation time.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ink-2)' }}>Labour markup %</label>
            <input
              type="number" min="0" max="100" step="0.01"
              value={form.labour_markup_percent}
              onChange={e => setForm(f => ({ ...f, labour_markup_percent: e.target.value }))}
              className="w-full rounded px-3 py-2 text-sm focus:outline-none"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ink-2)' }}>Materials & trades markup %</label>
            <input
              type="number" min="0" max="100" step="0.01"
              value={form.materials_markup_percent}
              onChange={e => setForm(f => ({ ...f, materials_markup_percent: e.target.value }))}
              className="w-full rounded px-3 py-2 text-sm focus:outline-none"
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--ink)' }}>Default rates</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--ink-3)' }}>
          Pre-filled into the Add Labour form. Workers can override these per entry.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ink-2)' }}>
              Default hourly rate (AUD)
              <span className="ml-1 font-normal" style={{ color: 'var(--ink-4)' }}>optional</span>
            </label>
            <input
              type="number" min="0" step="0.01"
              value={form.default_hourly_rate}
              onChange={e => setForm(f => ({ ...f, default_hourly_rate: e.target.value }))}
              className="w-full rounded px-3 py-2 text-sm focus:outline-none"
              style={inputStyle}
              placeholder="e.g. 85.00"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ink-2)' }}>
              Default daily rate (AUD)
              <span className="ml-1 font-normal" style={{ color: 'var(--ink-4)' }}>optional</span>
            </label>
            <input
              type="number" min="0" step="0.01"
              value={form.default_daily_rate}
              onChange={e => setForm(f => ({ ...f, default_daily_rate: e.target.value }))}
              className="w-full rounded px-3 py-2 text-sm focus:outline-none"
              style={inputStyle}
              placeholder="e.g. 680.00"
            />
          </div>
        </div>
      </div>

      {error && (
        <p className="text-sm" style={{ color: 'var(--bad)' }}>{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={pending}
          className="rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 transition-colors"
          style={{ background: 'var(--accent)' }}
        >
          {pending ? 'Saving…' : 'Save settings'}
        </button>
        {saved && (
          <span className="text-sm font-medium" style={{ color: 'var(--ok)' }}>Saved ✓</span>
        )}
      </div>
    </div>
  )
}
