'use client'

import { useState, useTransition, useMemo, Fragment } from 'react'
import { upsertContract, updateTaskContractValue } from '@/app/actions/payments'
import type { ContractType } from '@/lib/types'
import { getPhaseColor } from '@/lib/phase-colors'

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
  projectId:     string
  projectName:   string
  projectAddress: string
  contractDate:  string
  builderName:   string
  homeownerName: string | null
  orgName:       string
  contract:      ContractData | null
  phases:        PhaseRow[]
  tasks:         TaskRow[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n)

const inputStyle = {
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--ink)',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ContractPaymentsClient({
  projectId, projectName, projectAddress, contractDate, builderName, homeownerName, orgName,
  contract, phases, tasks,
}: Props) {

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
  const phaseData = useMemo(() => {
    const sorted = [...phases].sort((a, b) => a.sort_order - b.sort_order)
    return sorted.map((phase, i) => {
      const phaseTasks    = tasks.filter((t) => t.phase_id === phase.id)
      const contractValue = phaseTasks.reduce((s, t) => s + (taskValues[t.id] ?? 0), 0)
      const earnedValue   = phaseTasks.reduce((s, t) => s + (taskValues[t.id] ?? 0) * (t.progress_pct / 100), 0)
      const progress      = contractValue > 0 ? (earnedValue / contractValue) * 100 : 0
      return { phase, phaseTasks, contractValue, earnedValue, progress, phaseColor: getPhaseColor(i) }
    })
  }, [phases, tasks, taskValues])

  const totalContractValue = phaseData.reduce((s, p) => s + p.contractValue, 0)
  const totalEarned        = phaseData.reduce((s, p) => s + p.earnedValue, 0)
  const totalProgress      = totalContractValue > 0 ? (totalEarned / totalContractValue) * 100 : 0

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

  // ── Schedule of Works ────────────────────────────────────────────────────────

  const schedulePhases = useMemo(() =>
    phases
      .map((phase) => ({
        name: phase.name,
        tasks: tasks
          .filter((t) => t.phase_id === phase.id)
          .map((t) => ({ name: t.name, contractValue: taskValues[t.id] ?? 0 })),
      }))
      .filter((p) => p.tasks.length > 0),
    [phases, tasks, taskValues]
  )

  const hasTasks = tasks.length > 0
  const tasksWithNoValue = tasks.filter((t) => (taskValues[t.id] ?? 0) === 0)

  const scheduleMismatch =
    form.current_contract_sum > 0 &&
    Math.abs(totalContractValue - form.current_contract_sum) > 0.01

  const [schedPending, setSchedPending] = useState(false)

  function buildScheduleData() {
    return {
      projectName, projectAddress, contractDate, builderName, homeownerName, orgName,
      phases: schedulePhases,
      grandTotal: totalContractValue,
      generatedDate: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }),
    }
  }

  async function handleDownloadPDF() {
    setSchedPending(true)
    try {
      const { pdf }   = await import('@react-pdf/renderer')
      const { default: ScheduleOfWorksPDF } = await import('./ScheduleOfWorksPDF')
      const blob = await pdf(<ScheduleOfWorksPDF {...buildScheduleData()} />).toBlob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      const date = new Date().toISOString().split('T')[0]
      a.href     = url
      a.download = `Schedule_of_Works_${projectName.replace(/[^a-z0-9]/gi, '_')}_${date}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('PDF generation failed:', err)
    } finally {
      setSchedPending(false)
    }
  }

  async function handleDownloadDocx() {
    setSchedPending(true)
    try {
      const { generateScheduleDocx } = await import('./generateScheduleDocx')
      const blob = await generateScheduleDocx(buildScheduleData())
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      const date = new Date().toISOString().split('T')[0]
      a.href     = url
      a.download = `Schedule_of_Works_${projectName.replace(/[^a-z0-9]/gi, '_')}_${date}.docx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Docx generation failed:', err)
    } finally {
      setSchedPending(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="overflow-y-auto flex-1">
      <div className="max-w-5xl mx-auto px-8 py-8 space-y-10">

        {/* ── Section 1: Contract Details ─────────────────────────────────── */}
        <section>
          <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--ink)' }}>Contract Details</h2>
          <div className="rounded-lg p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="grid grid-cols-2 gap-x-8 gap-y-5">

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Contract Sum</span>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-sm select-none" style={{ color: 'var(--ink-4)' }}>$</span>
                  <input
                    type="number" min={0} step={0.01}
                    className="w-full pl-7 pr-3 py-2 rounded text-sm focus:outline-none"
                    style={inputStyle}
                    value={form.contract_sum}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setForm((f) => ({ ...f, contract_sum: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>
                  Current Contract Sum{' '}
                  <span className="font-normal" style={{ color: 'var(--ink-4)' }}>(after variations)</span>
                </span>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-sm select-none" style={{ color: 'var(--ink-4)' }}>$</span>
                  <input
                    type="number" min={0} step={0.01}
                    className="w-full pl-7 pr-3 py-2 rounded text-sm focus:outline-none"
                    style={inputStyle}
                    value={form.current_contract_sum}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setForm((f) => ({ ...f, current_contract_sum: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Retention %</span>
                <div className="relative">
                  <input
                    type="number" min={0} max={100} step={0.5}
                    className="w-full pl-3 pr-8 py-2 rounded text-sm focus:outline-none"
                    style={inputStyle}
                    value={form.retention_pct}
                    onChange={(e) => setForm((f) => ({ ...f, retention_pct: parseFloat(e.target.value) || 0 }))}
                  />
                  <span className="absolute right-3 top-2 text-sm select-none" style={{ color: 'var(--ink-4)' }}>%</span>
                </div>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>
                  Payment Terms{' '}
                  <span className="font-normal" style={{ color: 'var(--ink-4)' }}>(business days, SOP Act)</span>
                </span>
                <input
                  type="number" min={1}
                  className="w-full px-3 py-2 rounded text-sm focus:outline-none"
                  style={inputStyle}
                  value={form.payment_terms_days}
                  onChange={(e) => setForm((f) => ({ ...f, payment_terms_days: parseInt(e.target.value) || 10 }))}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Contract Type</span>
                <select
                  className="w-full px-3 py-2 rounded text-sm focus:outline-none"
                  style={inputStyle}
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
                className="px-4 py-2 text-white text-sm font-medium rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{ background: 'var(--accent)' }}
              >
                {contractPending ? 'Saving…' : 'Save Contract Details'}
              </button>
              {savedFlash && (
                <span className="text-sm font-medium" style={{ color: 'var(--ok)' }}>Saved ✓</span>
              )}
            </div>
          </div>
        </section>

        {/* ── Section 2: Task Contract Values ─────────────────────────────── */}
        <section>
          <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--ink)' }}>Task Contract Values</h2>
          <p className="text-xs mb-4" style={{ color: 'var(--ink-3)' }}>
            Assign a value to each task. Values save automatically when you leave the field.
            The total must equal the Current Contract Sum.
          </p>

          {hasWarning && (
            <div className="mb-4 px-4 py-3 rounded-lg flex items-start gap-2.5" style={{ background: 'var(--warn-soft)', border: '1px solid var(--warn)' }}>
              <span className="text-base mt-px" style={{ color: 'var(--warn)' }}>⚠</span>
              <p className="text-sm" style={{ color: 'var(--warn)' }}>
                <span className="font-semibold">Values don&apos;t balance.</span>{' '}
                Task values total <span className="font-medium">{fmt(totalContractValue)}</span> but
                Current Contract Sum is <span className="font-medium">{fmt(form.current_contract_sum)}</span>.{' '}
                Difference: <span className="font-medium">{fmt(Math.abs(totalContractValue - form.current_contract_sum))}</span>.
              </p>
            </div>
          )}

          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  <th className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Task</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>Contract Value</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Progress</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>Earned Value</th>
                </tr>
              </thead>
              <tbody>
                {phaseData.map(({ phase, phaseTasks, contractValue, earnedValue, progress, phaseColor }) => (
                  <Fragment key={phase.id}>
                    {/* Phase header row */}
                    <tr style={{ borderBottom: '1px solid var(--border)', background: `${phaseColor}14` }}>
                      <td className="px-4 py-2 text-xs uppercase tracking-wide font-semibold" style={{ color: 'var(--ink-2)' }}>
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-sm mr-2 align-middle"
                          style={{ background: phaseColor }}
                        />
                        {phase.name}
                      </td>
                      <td className="px-4 py-2 text-right text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>{fmt(contractValue)}</td>
                      <td className="px-4 py-2 text-right text-xs" style={{ color: 'var(--ink-3)' }}>{progress.toFixed(1)}%</td>
                      <td className="px-4 py-2 text-right text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>{fmt(earnedValue)}</td>
                    </tr>

                    {/* Task rows */}
                    {phaseTasks.map((task) => {
                      const val = taskValues[task.id] ?? 0
                      const earned = val * (task.progress_pct / 100)
                      return (
                        <tr key={task.id} className="transition-colors" style={{ borderBottom: '1px solid var(--border)' }}>
                          <td className="pl-8 pr-4 py-1.5" style={{ color: 'var(--ink-2)' }}>{task.name}</td>
                          <td className="px-4 py-1.5 text-right">
                            <div className="relative inline-flex items-center justify-end gap-1.5">
                              <div className="relative">
                                <span className="absolute left-2.5 top-1.5 text-xs select-none" style={{ color: 'var(--ink-4)' }}>$</span>
                                <input
                                  type="number" min={0} step={100}
                                  className="w-32 pl-6 pr-2 py-1 rounded text-right text-sm focus:outline-none transition-colors"
                                  style={inputStyle}
                                  value={val}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) => handleTaskChange(task.id, e.target.value)}
                                  onBlur={() => handleTaskBlur(task.id)}
                                />
                              </div>
                              {savingTasks.has(task.id) && (
                                <span className="text-xs w-4" style={{ color: 'var(--ink-4)' }}>…</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-1.5 text-right text-xs" style={{ color: 'var(--ink-3)' }}>{task.progress_pct}%</td>
                          <td className="px-4 py-1.5 text-right text-xs" style={{ color: 'var(--ink-3)' }}>{fmt(earned)}</td>
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
          <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--ink)' }}>Summary</h2>
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  <th className="text-left px-4 py-2.5 text-xs font-medium w-full" style={{ color: 'var(--ink-3)' }}>Phase</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>Contract Value</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Progress %</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>Earned Value</th>
                </tr>
              </thead>
              <tbody>
                {phaseData.map(({ phase, contractValue, earnedValue, progress, phaseColor }) => (
                  <tr key={phase.id} style={{ borderBottom: '1px solid var(--border)', background: `${phaseColor}14` }}>
                    <td className="px-4 py-2.5" style={{ color: 'var(--ink-2)' }}>
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-sm mr-2 align-middle"
                        style={{ background: phaseColor }}
                      />
                      {phase.name}
                    </td>
                    <td className="px-4 py-2.5 text-right" style={{ color: 'var(--ink-2)' }}>{fmt(contractValue)}</td>
                    <td className="px-4 py-2.5 text-right" style={{ color: 'var(--ink-3)' }}>{progress.toFixed(1)}%</td>
                    <td className="px-4 py-2.5 text-right" style={{ color: 'var(--ink-2)' }}>{fmt(earnedValue)}</td>
                  </tr>
                ))}

                {/* Total row */}
                <tr style={{ background: 'var(--surface-2)', borderTop: '2px solid var(--border)' }}>
                  <td className="px-4 py-3 text-sm font-bold" style={{ color: 'var(--ink)' }}>Total</td>
                  <td className="px-4 py-3 text-right text-sm font-bold" style={{ color: 'var(--ink)' }}>{fmt(totalContractValue)}</td>
                  <td className="px-4 py-3 text-right text-sm font-bold" style={{ color: 'var(--ink)' }}>{totalProgress.toFixed(1)}%</td>
                  <td className="px-4 py-3 text-right text-sm font-bold" style={{ color: 'var(--ink)' }}>{fmt(totalEarned)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Section 4: Schedule of Works ────────────────────────────────── */}
        <section>
          <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--ink)' }}>Schedule of Works</h2>
          <p className="text-xs mb-4" style={{ color: 'var(--ink-3)' }}>
            Generate a line item schedule of works to annexe to your contract.
          </p>

          <div className="rounded-lg p-6 space-y-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

            {!hasTasks ? (
              <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
                Add tasks on the Tasks page before generating a schedule of works.
              </p>
            ) : (
              <>
                {/* Tasks with no value warning */}
                {tasksWithNoValue.length > 0 && (
                  <div className="px-4 py-3 rounded-lg" style={{ background: 'var(--warn-soft)', border: '1px solid var(--warn)' }}>
                    <p className="text-sm font-semibold mb-1" style={{ color: 'var(--warn)' }}>
                      {tasksWithNoValue.length} task{tasksWithNoValue.length !== 1 ? 's' : ''} have no contract value
                    </p>
                    <ul className="text-xs list-disc list-inside space-y-0.5" style={{ color: 'var(--warn)' }}>
                      {tasksWithNoValue.slice(0, 5).map((t) => (
                        <li key={t.id}>{t.name}</li>
                      ))}
                      {tasksWithNoValue.length > 5 && (
                        <li>…and {tasksWithNoValue.length - 5} more</li>
                      )}
                    </ul>
                    <p className="text-xs mt-2" style={{ color: 'var(--warn)' }}>These tasks will appear as $0.00 in the schedule.</p>
                  </div>
                )}

                {/* Mismatch warning */}
                {scheduleMismatch && (
                  <div className="px-4 py-3 rounded-lg flex items-start gap-2.5" style={{ background: 'var(--warn-soft)', border: '1px solid var(--warn)' }}>
                    <span className="text-base mt-px" style={{ color: 'var(--warn)' }}>⚠</span>
                    <p className="text-sm" style={{ color: 'var(--warn)' }}>
                      Line items total <span className="font-medium">{fmt(totalContractValue)}</span> but
                      contract value is <span className="font-medium">{fmt(form.current_contract_sum)}</span>{' '}
                      — <span className="font-medium">{fmt(Math.abs(totalContractValue - form.current_contract_sum))}</span> difference.
                      The schedule will still generate.
                    </p>
                  </div>
                )}

                {/* Download buttons */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleDownloadPDF}
                    disabled={schedPending}
                    className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    style={{ background: 'var(--accent)' }}
                  >
                    {schedPending ? 'Generating…' : '↓ Download as PDF'}
                  </button>
                  <button
                    onClick={handleDownloadDocx}
                    disabled={schedPending}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    style={{ background: 'var(--surface)', color: 'var(--accent)', border: '1px solid var(--accent-soft)' }}
                  >
                    {schedPending ? 'Generating…' : '↓ Download as Word'}
                  </button>
                  <span className="text-xs" style={{ color: 'var(--ink-4)' }}>
                    {tasks.length} task{tasks.length !== 1 ? 's' : ''} · {fmt(totalContractValue)} total
                  </span>
                </div>
              </>
            )}
          </div>
        </section>

      </div>
    </div>
  )
}
