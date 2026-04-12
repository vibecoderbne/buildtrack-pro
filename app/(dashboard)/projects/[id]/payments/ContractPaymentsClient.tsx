'use client'

import { useState, useTransition, useMemo, Fragment } from 'react'
import { upsertContract, updateTaskContractValue } from '@/app/actions/payments'
import type { ContractType } from '@/lib/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PhaseRow {
  id: string
  name: string
  color: string
  sort_order: number
}

interface TaskRow {
  id: string
  name: string
  phase_id: string
  contract_value: number
  progress_pct: number
  sort_order: number
}

interface ContractData {
  contract_sum: number
  current_contract_sum: number
  retention_pct: number
  payment_terms_days: number
  contract_type: ContractType
}

interface Props {
  projectId: string
  contract: ContractData | null
  phases: PhaseRow[]
  tasks: TaskRow[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n)

// ── Component ─────────────────────────────────────────────────────────────────

export default function ContractPaymentsClient({ projectId, contract, phases, tasks }: Props) {

  // ── Contract form state ──────────────────────────────────────────────────
  const [form, setForm] = useState<ContractData>({
    contract_sum:         contract?.contract_sum         ?? 0,
    current_contract_sum: contract?.current_contract_sum ?? 0,
    retention_pct:        contract?.retention_pct        ?? 5,
    payment_terms_days:   contract?.payment_terms_days   ?? 10,
    contract_type:        contract?.contract_type        ?? 'fixed_price',
  })
  const [contractPending, startContractSave] = useTransition()
  const [savedFlash, setSavedFlash] = useState(false)

  // ── Task value state ─────────────────────────────────────────────────────
  const [taskValues, setTaskValues] = useState<Record<string, number>>(
    () => Object.fromEntries(tasks.map((t) => [t.id, Number(t.contract_value)]))
  )
  const [savingTasks, setSavingTasks] = useState<Set<string>>(new Set())

  // ── Derived calculations ─────────────────────────────────────────────────
  const phaseData = useMemo(() => phases.map((phase) => {
    const phaseTasks = tasks.filter((t) => t.phase_id === phase.id)
    const contractValue = phaseTasks.reduce((s, t) => s + (taskValues[t.id] ?? 0), 0)
    const earnedValue   = phaseTasks.reduce((s, t) => s + (taskValues[t.id] ?? 0) * (t.progress_pct / 100), 0)
    const progress      = contractValue > 0 ? (earnedValue / contractValue) * 100 : 0
    return { phase, phaseTasks, contractValue, earnedValue, progress }
  }), [phases, tasks, taskValues])

  const totalContractValue = phaseData.reduce((s, p) => s + p.contractValue, 0)
  const totalEarned        = phaseData.reduce((s, p) => s + p.earnedValue, 0)
  const totalProgress      = totalContractValue > 0 ? (totalEarned / totalContractValue) * 100 : 0

  // Warning only fires once the user has entered a current_contract_sum
  const hasWarning =
    form.current_contract_sum > 0 &&
    Math.abs(totalContractValue - form.current_contract_sum) > 0.01

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleContractSave = () => {
    startContractSave(async () => {
      await upsertContract(projectId, form)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2500)
    })
  }

  const handleTaskChange = (taskId: string, raw: string) => {
    const value = parseFloat(raw) || 0
    setTaskValues((prev) => ({ ...prev, [taskId]: value }))
  }

  const handleTaskBlur = async (taskId: string) => {
    const value = taskValues[taskId] ?? 0
    setSavingTasks((prev) => new Set(prev).add(taskId))
    try {
      await updateTaskContractValue(taskId, value)
    } catch (err) {
      console.error('Failed to save task contract value:', err)
    } finally {
      setSavingTasks((prev) => {
        const next = new Set(prev)
        next.delete(taskId)
        return next
      })
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="overflow-y-auto flex-1">
      <div className="max-w-5xl mx-auto px-8 py-8 space-y-10">

        {/* ── Section 1: Contract Details ─────────────────────────────────── */}
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-4">Contract Details</h2>
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="grid grid-cols-2 gap-x-8 gap-y-5">

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-gray-500">Contract Sum</span>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-400 text-sm select-none">$</span>
                  <input
                    type="number" min={0} step={0.01}
                    className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                    value={form.contract_sum}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setForm((f) => ({ ...f, contract_sum: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-gray-500">
                  Current Contract Sum{' '}
                  <span className="text-gray-400 font-normal">(after variations)</span>
                </span>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-400 text-sm select-none">$</span>
                  <input
                    type="number" min={0} step={0.01}
                    className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                    value={form.current_contract_sum}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setForm((f) => ({ ...f, current_contract_sum: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-gray-500">Retention %</span>
                <div className="relative">
                  <input
                    type="number" min={0} max={100} step={0.5}
                    className="w-full pl-3 pr-8 py-2 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                    value={form.retention_pct}
                    onChange={(e) => setForm((f) => ({ ...f, retention_pct: parseFloat(e.target.value) || 0 }))}
                  />
                  <span className="absolute right-3 top-2 text-gray-400 text-sm select-none">%</span>
                </div>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-gray-500">
                  Payment Terms{' '}
                  <span className="text-gray-400 font-normal">(business days, SOP Act)</span>
                </span>
                <input
                  type="number" min={1}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                  value={form.payment_terms_days}
                  onChange={(e) => setForm((f) => ({ ...f, payment_terms_days: parseInt(e.target.value) || 10 }))}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-gray-500">Contract Type</span>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                  value={form.contract_type}
                  onChange={(e) => setForm((f) => ({ ...f, contract_type: e.target.value as ContractType }))}
                >
                  <option value="fixed_price">Fixed Price</option>
                  <option value="cost_plus">Cost Plus</option>
                  <option value="hia_standard">HIA Standard</option>
                </select>
              </label>

            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={handleContractSave}
                disabled={contractPending}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {contractPending ? 'Saving…' : 'Save Contract Details'}
              </button>
              {savedFlash && (
                <span className="text-sm text-green-600 font-medium">Saved ✓</span>
              )}
            </div>
          </div>
        </section>

        {/* ── Section 2: Task Contract Values ─────────────────────────────── */}
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-1">Task Contract Values</h2>
          <p className="text-xs text-gray-500 mb-4">
            Assign a value to each task. Values save automatically when you leave the field.
            The total must equal the Current Contract Sum.
          </p>

          {hasWarning && (
            <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2.5">
              <span className="text-amber-500 text-base mt-px">⚠</span>
              <p className="text-sm text-amber-800">
                <span className="font-semibold">Values don&apos;t balance.</span>{' '}
                Task values total <span className="font-medium">{fmt(totalContractValue)}</span> but
                Current Contract Sum is <span className="font-medium">{fmt(form.current_contract_sum)}</span>.{' '}
                Difference: <span className="font-medium">{fmt(Math.abs(totalContractValue - form.current_contract_sum))}</span>.
              </p>
            </div>
          )}

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Task</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">Contract Value</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Progress</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">Earned Value</th>
                </tr>
              </thead>
              <tbody>
                {phaseData.map(({ phase, phaseTasks, contractValue, earnedValue, progress }) => (
                  <Fragment key={phase.id}>
                    {/* Phase header row */}
                    <tr className="border-b border-gray-100 bg-gray-50/80">
                      <td className="px-4 py-2 font-semibold text-gray-700 text-xs uppercase tracking-wide">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-sm mr-2 align-middle"
                          style={{ background: phase.color }}
                        />
                        {phase.name}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold text-gray-700 text-xs">{fmt(contractValue)}</td>
                      <td className="px-4 py-2 text-right text-gray-500 text-xs">{progress.toFixed(1)}%</td>
                      <td className="px-4 py-2 text-right font-semibold text-gray-700 text-xs">{fmt(earnedValue)}</td>
                    </tr>

                    {/* Task rows */}
                    {phaseTasks.map((task) => {
                      const val = taskValues[task.id] ?? 0
                      const earned = val * (task.progress_pct / 100)
                      return (
                        <tr key={task.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                          <td className="pl-8 pr-4 py-1.5 text-gray-600">{task.name}</td>
                          <td className="px-4 py-1.5 text-right">
                            <div className="relative inline-flex items-center justify-end gap-1.5">
                              <div className="relative">
                                <span className="absolute left-2.5 top-1.5 text-gray-400 text-xs select-none">$</span>
                                <input
                                  type="number" min={0} step={100}
                                  className="w-32 pl-6 pr-2 py-1 border border-gray-200 rounded text-right text-sm text-gray-900 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300 transition-colors"
                                  value={val}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) => handleTaskChange(task.id, e.target.value)}
                                  onBlur={() => handleTaskBlur(task.id)}
                                />
                              </div>
                              {savingTasks.has(task.id) && (
                                <span className="text-gray-400 text-xs w-4">…</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-1.5 text-right text-gray-500 text-xs">{task.progress_pct}%</td>
                          <td className="px-4 py-1.5 text-right text-gray-500 text-xs">{fmt(earned)}</td>
                        </tr>
                      )
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Section 3: Phase Summary ─────────────────────────────────────── */}
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-4">Summary</h2>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 w-full">Phase</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">Contract Value</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Progress %</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">Earned Value</th>
                </tr>
              </thead>
              <tbody>
                {phaseData.map(({ phase, contractValue, earnedValue, progress }) => (
                  <tr key={phase.id} className="border-b border-gray-100">
                    <td className="px-4 py-2.5 text-gray-700">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-sm mr-2 align-middle"
                        style={{ background: phase.color }}
                      />
                      {phase.name}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{fmt(contractValue)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{progress.toFixed(1)}%</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{fmt(earnedValue)}</td>
                  </tr>
                ))}

                {/* Total row */}
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td className="px-4 py-3 text-sm font-bold text-gray-900">Total</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">{fmt(totalContractValue)}</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">{totalProgress.toFixed(1)}%</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">{fmt(totalEarned)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </div>
  )
}
