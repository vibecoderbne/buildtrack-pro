'use client'

import { useState, useTransition, useEffect } from 'react'
import {
  createHomeownerUpdate,
  updateHomeownerUpdate,
  publishHomeownerUpdate,
  unpublishHomeownerUpdate,
  deleteHomeownerUpdate,
  type HomeownerUpdateRecord,
  type HomeownerUpdateInput,
} from '@/app/actions/homeowner'

// ── Types ──────────────────────────────────────────────────────────────────────

interface PageData {
  updates:    HomeownerUpdateRecord[]
  milestones: { id: string; name: string; phaseName: string }[]
  photos:     { id: string; storagePath: string; caption: string | null; taskName: string }[]
}

interface Props {
  projectId:   string
  initialData: PageData
  supabaseUrl: string
}

interface FormState {
  title:        string
  body:         string
  milestoneIds: string[]
  photoIds:     string[]
}

const emptyForm: FormState = { title: '', body: '', milestoneIds: [], photoIds: [] }

// ── Helpers ────────────────────────────────────────────────────────────────────

function photoUrl(supabaseUrl: string, storagePath: string) {
  return `${supabaseUrl}/storage/v1/object/public/task-photos/${storagePath}`
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function renderMarkdownPreview(text: string) {
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

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  draft:     { label: 'Draft',     bg: '#f3f4f6', color: '#374151' },
  published: { label: 'Published', bg: '#d1fae5', color: '#065f46' },
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function HomeownerUpdatesClient({ projectId, initialData, supabaseUrl }: Props) {
  const [data, setData]           = useState<PageData>(initialData)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm]           = useState<FormState>(emptyForm)
  const [previewMode, setPreview] = useState(false)
  const [pending, startTransition] = useTransition()
  const [photoSearch, setPhotoSearch] = useState('')

  // Keep data in sync when initialData changes (after server revalidation)
  useEffect(() => { setData(initialData) }, [initialData])

  function openNew() {
    setEditingId(null)
    setForm(emptyForm)
    setPreview(false)
    setPhotoSearch('')
    setModalOpen(true)
  }

  function openEdit(update: HomeownerUpdateRecord) {
    setEditingId(update.id)
    setForm({
      title:        update.title,
      body:         update.body,
      milestoneIds: [...update.milestoneIds],
      photoIds:     [...update.photoIds],
    })
    setPreview(false)
    setPhotoSearch('')
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingId(null)
  }

  function toggleArr<T>(arr: T[], val: T): T[] {
    return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
  }

  async function handleSave() {
    if (!form.title.trim()) return
    const input: HomeownerUpdateInput = {
      title:        form.title.trim(),
      body:         form.body.trim(),
      milestoneIds: form.milestoneIds,
      photoIds:     form.photoIds,
    }
    startTransition(async () => {
      try {
        if (editingId) {
          await updateHomeownerUpdate(editingId, input)
          setData(prev => ({
            ...prev,
            updates: prev.updates.map(u =>
              u.id === editingId
                ? { ...u, title: input.title, body: input.body, milestoneIds: input.milestoneIds, photoIds: input.photoIds }
                : u
            ),
          }))
        } else {
          await createHomeownerUpdate(projectId, input)
          // Server will refresh — we'll get updated data from parent on next render
          // For now, add optimistic record
          const optimistic: HomeownerUpdateRecord = {
            id:           `temp_${Date.now()}`,
            title:        input.title,
            body:         input.body,
            isPublished:  false,
            publishedAt:  null,
            createdAt:    new Date().toISOString(),
            photoIds:     input.photoIds,
            milestoneIds: input.milestoneIds,
            photos:       [],
            milestones:   [],
          }
          setData(prev => ({ ...prev, updates: [optimistic, ...prev.updates] }))
        }
        closeModal()
      } catch (err) {
        alert('Failed to save: ' + (err instanceof Error ? err.message : 'Unknown error'))
      }
    })
  }

  async function handlePublish(updateId: string) {
    startTransition(async () => {
      await publishHomeownerUpdate(updateId)
      setData(prev => ({
        ...prev,
        updates: prev.updates.map(u =>
          u.id === updateId ? { ...u, isPublished: true, publishedAt: new Date().toISOString() } : u
        ),
      }))
    })
  }

  async function handleUnpublish(updateId: string) {
    startTransition(async () => {
      await unpublishHomeownerUpdate(updateId)
      setData(prev => ({
        ...prev,
        updates: prev.updates.map(u =>
          u.id === updateId ? { ...u, isPublished: false, publishedAt: null } : u
        ),
      }))
    })
  }

  async function handleDelete(updateId: string) {
    if (!window.confirm('Delete this update?')) return
    startTransition(async () => {
      await deleteHomeownerUpdate(updateId)
      setData(prev => ({ ...prev, updates: prev.updates.filter(u => u.id !== updateId) }))
    })
  }

  const filteredPhotos = data.photos.filter(p =>
    photoSearch === '' ||
    (p.caption ?? '').toLowerCase().includes(photoSearch.toLowerCase()) ||
    p.taskName.toLowerCase().includes(photoSearch.toLowerCase())
  )

  return (
    <>
      {/* ── Update list ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={openNew}
            style={{
              padding: '8px 18px', borderRadius: 8, border: 'none',
              background: '#6366f1', color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + New Update
          </button>
        </div>

        {data.updates.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: '#9ca3af', background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
            <div style={{ fontSize: 14 }}>No updates yet — create one to get started</div>
          </div>
        )}

        {data.updates.map((update) => {
          const badge = STATUS_BADGE[update.isPublished ? 'published' : 'draft']
          return (
            <div key={update.id} style={{
              background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb',
              padding: '18px 22px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#111' }}>{update.title}</span>
                    <span style={{
                      padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                      background: badge.bg, color: badge.color,
                    }}>{badge.label}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                    Created {formatDate(update.createdAt)}
                    {update.publishedAt && ` · Published ${formatDate(update.publishedAt)}`}
                  </div>
                  {update.body && (
                    <div style={{
                      marginTop: 10, fontSize: 13, color: '#6b7280', lineHeight: 1.6,
                      overflow: 'hidden', display: '-webkit-box',
                      WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      whiteSpace: 'pre-line',
                    }}>
                      {update.body.slice(0, 180)}{update.body.length > 180 ? '…' : ''}
                    </div>
                  )}
                  {(update.photoIds.length > 0 || update.milestoneIds.length > 0) && (
                    <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                      {update.photoIds.length > 0 && (
                        <span style={{ fontSize: 12, color: '#9ca3af' }}>📷 {update.photoIds.length} photo{update.photoIds.length > 1 ? 's' : ''}</span>
                      )}
                      {update.milestoneIds.length > 0 && (
                        <span style={{ fontSize: 12, color: '#9ca3af' }}>♦ {update.milestoneIds.length} milestone{update.milestoneIds.length > 1 ? 's' : ''}</span>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => openEdit(update)}
                    style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', fontSize: 12, cursor: 'pointer', color: '#374151' }}
                  >
                    Edit
                  </button>
                  {update.isPublished ? (
                    <button
                      onClick={() => handleUnpublish(update.id)}
                      disabled={pending}
                      style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #fcd34d', background: '#fffbeb', fontSize: 12, cursor: 'pointer', color: '#92400e' }}
                    >
                      Unpublish
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePublish(update.id)}
                      disabled={pending}
                      style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#10b981', fontSize: 12, cursor: 'pointer', color: '#fff', fontWeight: 600 }}
                    >
                      Publish
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(update.id)}
                    disabled={pending}
                    style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #fca5a5', background: '#fff', fontSize: 12, cursor: 'pointer', color: '#dc2626' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Modal ────────────────────────────────────────────────────────── */}
      {modalOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onMouseDown={closeModal}
        >
          <div
            style={{
              background: '#fff', borderRadius: 12, width: '100%', maxWidth: 680,
              maxHeight: '90vh', display: 'flex', flexDirection: 'column',
              boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
            }}
            onMouseDown={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111' }}>
                {editingId ? 'Edit Update' : 'New Update'}
              </h2>
            </div>

            {/* Modal body — scrollable */}
            <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>

              {/* Title */}
              <label style={labelStyle}>
                Title *
                <input
                  style={inputStyle}
                  type="text"
                  value={form.title}
                  onChange={e => setForm(s => ({ ...s, title: e.target.value }))}
                  placeholder="e.g. Week 12 — Framing complete"
                  autoFocus
                />
              </label>

              {/* Body with preview toggle */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#6b7280' }}>Update body</span>
                  <button
                    type="button"
                    onClick={() => setPreview(v => !v)}
                    style={{
                      fontSize: 11, fontWeight: 500, color: '#6366f1',
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    }}
                  >
                    {previewMode ? '✏️ Edit' : '👁 Preview'}
                  </button>
                </div>
                {previewMode ? (
                  <div style={{
                    ...inputStyle,
                    minHeight: 140, whiteSpace: 'pre-wrap', fontSize: 14,
                    color: form.body ? '#374151' : '#9ca3af',
                  }}>
                    {form.body ? renderMarkdownPreview(form.body) : 'Nothing to preview'}
                  </div>
                ) : (
                  <textarea
                    style={{ ...inputStyle, resize: 'vertical', minHeight: 140, lineHeight: 1.6 }}
                    value={form.body}
                    onChange={e => setForm(s => ({ ...s, body: e.target.value }))}
                    placeholder="Write an update for the homeowner. Use **bold** for emphasis."
                  />
                )}
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                  Tip: Use **double asterisks** for bold text
                </div>
              </div>

              {/* Milestones picker */}
              {data.milestones.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#6b7280', marginBottom: 8 }}>
                    Milestones reached <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span>
                  </div>
                  <div style={{
                    border: '1px solid #e5e7eb', borderRadius: 8, maxHeight: 160, overflow: 'auto',
                  }}>
                    {data.milestones.map((m, i) => (
                      <label key={m.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px',
                        borderBottom: i < data.milestones.length - 1 ? '1px solid #f3f4f6' : 'none',
                        cursor: 'pointer',
                      }}>
                        <input
                          type="checkbox"
                          checked={form.milestoneIds.includes(m.id)}
                          onChange={() => setForm(s => ({ ...s, milestoneIds: toggleArr(s.milestoneIds, m.id) }))}
                          style={{ width: 15, height: 15, accentColor: '#6366f1', cursor: 'pointer', flexShrink: 0 }}
                        />
                        <div>
                          <div style={{ fontSize: 13, color: '#111' }}>♦ {m.name}</div>
                          <div style={{ fontSize: 11, color: '#9ca3af' }}>{m.phaseName}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Photos picker */}
              {data.photos.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#6b7280', marginBottom: 8 }}>
                    Include photos <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span>
                  </div>
                  <input
                    style={{ ...inputStyle, marginBottom: 8, fontSize: 12 }}
                    type="text"
                    placeholder="Search photos by task or caption…"
                    value={photoSearch}
                    onChange={e => setPhotoSearch(e.target.value)}
                  />
                  <div style={{
                    border: '1px solid #e5e7eb', borderRadius: 8,
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                    gap: 8, padding: 8, maxHeight: 220, overflow: 'auto',
                  }}>
                    {filteredPhotos.map((photo) => {
                      const selected = form.photoIds.includes(photo.id)
                      return (
                        <label key={photo.id} style={{
                          cursor: 'pointer', borderRadius: 6, overflow: 'hidden',
                          border: selected ? '2px solid #6366f1' : '2px solid transparent',
                          background: '#f9fafb', position: 'relative',
                        }}>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => setForm(s => ({ ...s, photoIds: toggleArr(s.photoIds, photo.id) }))}
                            style={{ position: 'absolute', top: 4, left: 4, zIndex: 2, accentColor: '#6366f1' }}
                          />
                          <img
                            src={photoUrl(supabaseUrl, photo.storagePath)}
                            alt={photo.caption ?? photo.taskName}
                            style={{ width: '100%', height: 80, objectFit: 'cover', display: 'block' }}
                          />
                          <div style={{ padding: '4px 6px', fontSize: 10, color: '#6b7280', lineHeight: 1.3 }}>
                            {photo.caption ?? photo.taskName}
                          </div>
                        </label>
                      )
                    })}
                    {filteredPhotos.length === 0 && (
                      <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '16px', fontSize: 13, color: '#9ca3af' }}>
                        No photos match
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>

            {/* Modal footer */}
            <div style={{
              padding: '16px 24px', borderTop: '1px solid #f3f4f6', flexShrink: 0,
              display: 'flex', justifyContent: 'flex-end', gap: 10,
            }}>
              <button
                type="button"
                onClick={closeModal}
                style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={pending || !form.title.trim()}
                style={{
                  padding: '8px 20px', borderRadius: 6, border: 'none',
                  background: '#6366f1', color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: pending || !form.title.trim() ? 'not-allowed' : 'pointer',
                  opacity: pending || !form.title.trim() ? 0.6 : 1,
                }}
              >
                {pending ? 'Saving…' : 'Save Draft'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 5,
  fontSize: 12, fontWeight: 500, color: '#6b7280', marginBottom: 16,
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db',
  fontSize: 14, color: '#111', outline: 'none', width: '100%',
  boxSizing: 'border-box',
}
