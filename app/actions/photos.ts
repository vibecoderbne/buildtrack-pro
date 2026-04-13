'use server'

import { refresh } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TaskPhotoRecord {
  id: string
  taskId: string
  storagePath: string
  caption: string | null
  isVisibleToHomeowner: boolean
  uploadedAt: string
}

// ── Actions ────────────────────────────────────────────────────────────────────

export async function getTaskPhotos(taskId: string): Promise<TaskPhotoRecord[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const { data } = await supabase
    .from('task_photos')
    .select('id, task_id, storage_path, caption, is_visible_to_homeowner, uploaded_at')
    .eq('task_id', taskId)
    .order('uploaded_at', { ascending: true })

  return (data ?? []).map((p) => ({
    id:                   p.id,
    taskId:               p.task_id,
    storagePath:          p.storage_path,
    caption:              p.caption,
    isVisibleToHomeowner: p.is_visible_to_homeowner,
    uploadedAt:           p.uploaded_at,
  }))
}

export async function createTaskPhoto(
  taskId: string,
  storagePath: string,
  caption: string | null,
  isVisibleToHomeowner: boolean
): Promise<TaskPhotoRecord> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const { data, error } = await supabase
    .from('task_photos')
    .insert({
      task_id:                  taskId,
      uploaded_by:              user.id,
      storage_path:             storagePath,
      caption:                  caption,
      is_visible_to_homeowner:  isVisibleToHomeowner,
    })
    .select('id, task_id, storage_path, caption, is_visible_to_homeowner, uploaded_at')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Failed to save photo')

  return {
    id:                   data.id,
    taskId:               data.task_id,
    storagePath:          data.storage_path,
    caption:              data.caption,
    isVisibleToHomeowner: data.is_visible_to_homeowner,
    uploadedAt:           data.uploaded_at,
  }
}

export async function updateTaskPhoto(
  photoId: string,
  caption: string | null,
  isVisibleToHomeowner: boolean
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  const { error } = await supabase
    .from('task_photos')
    .update({ caption, is_visible_to_homeowner: isVisibleToHomeowner })
    .eq('id', photoId)

  if (error) throw new Error(error.message)
}

export async function deleteTaskPhoto(photoId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorised')

  // Fetch the storage path before deleting the record
  const { data: photo } = await supabase
    .from('task_photos')
    .select('storage_path')
    .eq('id', photoId)
    .single()

  // Delete the DB record first
  const { error } = await supabase.from('task_photos').delete().eq('id', photoId)
  if (error) throw new Error(error.message)

  // Best-effort storage deletion — don't throw if this fails
  if (photo?.storage_path) {
    try {
      await supabase.storage.from('task-photos').remove([photo.storage_path])
    } catch {
      console.warn('Storage deletion failed for', photo.storage_path)
    }
  }

  refresh()
}
