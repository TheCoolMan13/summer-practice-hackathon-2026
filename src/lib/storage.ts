import { supabase } from './supabaseClient'

const BUCKET = 'avatars'

/**
 * Upload a profile picture for the given user.
 * File is stored at avatars/{userId}/{timestamp}.{ext}
 * Returns the public URL of the uploaded file.
 * Throws on upload failure.
 *
 * Validates file type (JPEG/PNG only) and size (max 5 MB) per Requirement 3.5.
 */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const allowedTypes = ['image/jpeg', 'image/png']
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Only JPEG and PNG files are supported.')
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('File size must not exceed 5 MB.')
  }

  const ext = file.type === 'image/png' ? 'png' : 'jpg'
  const path = `${userId}/${Date.now()}.${ext}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type,
  })

  if (error) throw error

  return getAvatarUrl(userId, path)
}

/**
 * Get the public URL for a user's avatar.
 * If no specific path is provided, returns the URL pattern for the user's folder.
 */
export function getAvatarUrl(userId: string, path?: string): string {
  const filePath = path ?? `${userId}/avatar`
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath)
  return data.publicUrl
}
