import type { HomeownerDashboardData } from '@/app/actions/homeowner'

interface Props {
  data: HomeownerDashboardData
  supabaseUrl: string
  isBuilderPreview?: boolean
}

function photoUrl(supabaseUrl: string, storagePath: string): string {
  return `${supabaseUrl}/storage/v1/object/public/task-photos/${storagePath}`
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function renderMarkdown(text: string): React.ReactNode {
  // Very simple markdown: **bold**, line breaks
  const lines = text.split('\n')
  return lines.map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g)
    return (
      <span key={i}>
        {parts.map((part, j) =>
          part.startsWith('**') && part.endsWith('**')
            ? <strong key={j}>{part.slice(2, -2)}</strong>
            : part
        )}
        {i < lines.length - 1 && <br />}
      </span>
    )
  })
}

export default function HomeownerDashboardView({ data, supabaseUrl, isBuilderPreview }: Props) {
  const { project, phases, latestUpdate, upcomingMilestones } = data

  const overallPct = phases.length > 0
    ? Math.round(phases.reduce((s, p) => s + p.progressPct, 0) / phases.length)
    : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {isBuilderPreview && (
        <div style={{
          background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8,
          padding: '10px 16px', fontSize: 13, color: '#92400e', fontWeight: 500,
        }}>
          Builder preview — this is how the homeowner sees the project
        </div>
      )}

      {/* ── Project summary card ─────────────────────────────────────────── */}
      <div style={{
        background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb',
        padding: '24px 28px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Overall progress</div>
            <div style={{ fontSize: 36, fontWeight: 700, color: '#111' }}>{overallPct}%</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: '#6b7280', textAlign: 'right' }}>
            {project.startDate && (
              <span>Started: <strong style={{ color: '#374151' }}>{formatDate(project.startDate)}</strong></span>
            )}
            {project.targetCompletion && (
              <span>Target: <strong style={{ color: '#374151' }}>{formatDate(project.targetCompletion)}</strong></span>
            )}
            {project.currentCompletion && project.currentCompletion !== project.targetCompletion && (
              <span>Est. completion: <strong style={{ color: '#374151' }}>{formatDate(project.currentCompletion)}</strong></span>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: 16, background: '#f3f4f6', borderRadius: 99, height: 10, overflow: 'hidden' }}>
          <div style={{
            width: `${overallPct}%`, height: '100%',
            background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
            borderRadius: 99, transition: 'width 0.4s ease',
          }} />
        </div>
      </div>

      {/* ── Phase timeline ───────────────────────────────────────────────── */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '24px 28px' }}>
        <h2 style={{ margin: '0 0 20px', fontSize: 14, fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Build Stages
        </h2>

        <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, minWidth: phases.length * 100 }}>
            {phases.map((phase, idx) => {
              const isDone = phase.status === 'done'
              const isActive = phase.status === 'in_progress'

              return (
                <div key={phase.id} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 80 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                    {/* Circle */}
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: isDone ? phase.color : isActive ? phase.color : '#e5e7eb',
                      border: isActive ? `3px solid ${phase.color}` : isDone ? 'none' : '3px solid #d1d5db',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, color: isDone || isActive ? '#fff' : '#9ca3af',
                      fontWeight: 700, flexShrink: 0, position: 'relative',
                      boxShadow: isActive ? `0 0 0 4px ${phase.color}33` : 'none',
                    }}>
                      {isDone ? '✓' : isActive ? '●' : '○'}
                    </div>
                    {/* Label */}
                    <div style={{
                      marginTop: 8, fontSize: 11, fontWeight: isActive ? 600 : 400,
                      color: isDone ? '#374151' : isActive ? '#111' : '#9ca3af',
                      textAlign: 'center', lineHeight: 1.3, maxWidth: 80,
                    }}>
                      {phase.name}
                    </div>
                    {phase.status !== 'upcoming' && (
                      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                        {isDone ? '100%' : `${Math.round(phase.progressPct)}%`}
                      </div>
                    )}
                  </div>

                  {/* Connector line */}
                  {idx < phases.length - 1 && (
                    <div style={{
                      height: 3, flex: 1, background: isDone ? phase.color : '#e5e7eb',
                      marginBottom: 28, marginLeft: -2, marginRight: -2, flexShrink: 1,
                    }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Upcoming milestones ──────────────────────────────────────────── */}
      {upcomingMilestones.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '24px 28px' }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Upcoming Milestones
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {upcomingMilestones.map((m) => (
              <div key={m.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', background: '#f9fafb', borderRadius: 8,
                border: '1px solid #f3f4f6',
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#111' }}>♦ {m.name}</div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{m.phaseName}</div>
                </div>
                <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>
                  {formatDate(m.estimatedDate)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Latest update ────────────────────────────────────────────────── */}
      {latestUpdate ? (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '24px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Latest Update
            </h2>
            {latestUpdate.publishedAt && (
              <span style={{ fontSize: 12, color: '#9ca3af' }}>{formatDate(latestUpdate.publishedAt)}</span>
            )}
          </div>

          <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700, color: '#111' }}>
            {latestUpdate.title}
          </h3>

          <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.7 }}>
            {renderMarkdown(latestUpdate.body)}
          </div>

          {/* Milestones reached */}
          {latestUpdate.milestones.length > 0 && (
            <div style={{ marginTop: 16, padding: '12px 14px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#166534', marginBottom: 6 }}>MILESTONES REACHED</div>
              {latestUpdate.milestones.map((m) => (
                <div key={m.id} style={{ fontSize: 13, color: '#15803d', marginBottom: 2 }}>✓ {m.name}</div>
              ))}
            </div>
          )}

          {/* Photos */}
          {latestUpdate.photos.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Photos
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                {latestUpdate.photos.map((photo) => (
                  <div key={photo.id} style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                    <img
                      src={photoUrl(supabaseUrl, photo.storagePath)}
                      alt={photo.caption ?? photo.taskName}
                      style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }}
                    />
                    {photo.caption && (
                      <div style={{ padding: '6px 10px', fontSize: 12, color: '#6b7280' }}>
                        {photo.caption}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{
          background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb',
          padding: '32px 28px', textAlign: 'center', color: '#9ca3af',
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
          <div style={{ fontSize: 14 }}>No updates published yet</div>
        </div>
      )}

    </div>
  )
}
