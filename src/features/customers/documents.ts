import { getSupabaseClient } from '@/lib/supabase/client'
import { AppError, toAppError } from '@/lib/supabase/errors'
import { SENSITIVE_FILE_CACHE_CONTROL } from '@/lib/supabase/storage'
import type { CustomerDocument } from '@/types/database'

import { updateCustomerDocument } from './api'

/**
 * Storage for customer identification scans.
 *
 * The bucket is private and object keys are `<organization_id>/<customer_id>/…`,
 * which the storage policies read — the key *is* the access check, so a guessed
 * path from another agency resolves to a refusal rather than a passport scan.
 *
 * Nothing is ever given a permanent URL. Every view mints a short-lived signed
 * URL, and the lifetime here is deliberately shorter than the one used for
 * vehicle photographs: a licence scan is not a thumbnail.
 */

export const CUSTOMER_DOCUMENT_BUCKET = 'customer-documents'
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024

/** SVG is absent on purpose: it is an executable format on the storage origin. */
export const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
] as const

export type DocumentMimeType = (typeof DOCUMENT_MIME_TYPES)[number]

/** Five minutes is long enough to open a scan and short enough that a copied link dies. */
const SIGNED_URL_TTL_SECONDS = 300

/**
 * Identifies a file by its signature rather than its name.
 *
 * `File.type` comes from the extension and is trivially wrong or spoofed. The
 * bucket's allowed_mime_types is the real backstop; this check exists so a
 * mislabelled file is refused with a useful message before it is uploaded.
 */
export async function detectDocumentType(file: File): Promise<DocumentMimeType | null> {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  if (header.length < 12) return null

  const startsWith = (...bytes: number[]) => bytes.every((byte, index) => header[index] === byte)

  if (startsWith(0x25, 0x50, 0x44, 0x46)) return 'application/pdf' // %PDF
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png'
  if (startsWith(0xff, 0xd8, 0xff)) return 'image/jpeg'

  const isRiff = startsWith(0x52, 0x49, 0x46, 0x46)
  const isWebp =
    header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50
  if (isRiff && isWebp) return 'image/webp'

  return null
}

/**
 * A filename safe to store and to show back.
 *
 * The original is kept for the person who uploaded it, stripped of path
 * separators and control characters so it cannot be used to imply a directory
 * or to smuggle markup into the interface.
 */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'document'
  return (
    base
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1F<>:"|?*]/g, '')
      .trim()
      .slice(0, 200) || 'document'
  )
}

function extensionFor(mimeType: DocumentMimeType): string {
  switch (mimeType) {
    case 'application/pdf':
      return 'pdf'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'image/jpeg':
      return 'jpg'
  }
}

function documentKey(organizationId: string, customerId: string, extension: string): string {
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `${organizationId}/${customerId}/${unique}.${extension}`
}

export interface UploadDocumentInput {
  organizationId: string
  customerId: string
  document: CustomerDocument
  file: File
}

/**
 * Attaches a scan to an identification record.
 *
 * Metadata is recorded alongside the object — original name, MIME type, size,
 * who uploaded it and when — so the interface can describe a file without
 * fetching it, and so an object deleted out from under the row is detectable.
 */
export async function uploadCustomerDocumentFile(
  input: UploadDocumentInput,
): Promise<CustomerDocument> {
  const supabase = getSupabaseClient()

  if (input.file.size > DOCUMENT_MAX_BYTES) {
    throw new AppError('validation', 'Choose a file smaller than 10 MB.')
  }

  const mimeType = await detectDocumentType(input.file)
  if (!mimeType) {
    throw new AppError('validation', 'Attach a PDF, PNG, JPEG or WebP file.')
  }

  const path = documentKey(input.organizationId, input.customerId, extensionFor(mimeType))

  const upload = await supabase.storage.from(CUSTOMER_DOCUMENT_BUCKET).upload(path, input.file, {
    contentType: mimeType,
    cacheControl: SENSITIVE_FILE_CACHE_CONTROL,
    upsert: false,
  })

  if (upload.error) throw toAppError(upload.error)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  try {
    const previousPath = input.document.file_path

    const updated = await updateCustomerDocument(input.document.id, {
      file_path: path,
      file_name: safeFileName(input.file.name),
      file_mime_type: mimeType,
      file_size_bytes: input.file.size,
      uploaded_by: user?.id ?? null,
      uploaded_at: new Date().toISOString(),
    })

    // Replacing a scan removes the one it replaced, so a superseded passport
    // page does not linger in storage indefinitely.
    if (previousPath && previousPath !== path) {
      await supabase.storage.from(CUSTOMER_DOCUMENT_BUCKET).remove([previousPath])
    }

    return updated
  } catch (error) {
    // Never leave an orphaned object behind if the metadata write is refused.
    await supabase.storage.from(CUSTOMER_DOCUMENT_BUCKET).remove([path])
    throw error
  }
}

/** Detaches and deletes the scan, leaving the identification record in place. */
export async function removeCustomerDocumentFile(
  document: CustomerDocument,
): Promise<CustomerDocument> {
  const updated = await updateCustomerDocument(document.id, {
    file_path: null,
    file_name: null,
    file_mime_type: null,
    file_size_bytes: null,
    uploaded_by: null,
    uploaded_at: null,
  })

  if (document.file_path) {
    await getSupabaseClient().storage.from(CUSTOMER_DOCUMENT_BUCKET).remove([document.file_path])
  }

  return updated
}

/** Deletes the record and any attached scan together. */
export async function deleteCustomerDocument(document: CustomerDocument): Promise<void> {
  const supabase = getSupabaseClient()

  const { error } = await supabase.from('customer_documents').delete().eq('id', document.id)
  if (error) throw toAppError(error)

  if (document.file_path) {
    await supabase.storage.from(CUSTOMER_DOCUMENT_BUCKET).remove([document.file_path])
  }
}

/**
 * A short-lived URL for one scan, minted at the moment somebody asks to see it.
 *
 * Never requested for a list: identification is opened deliberately, one
 * document at a time, by a person who has already opened the profile.
 */
export async function signDocumentUrl(
  path: string,
  expiresInSeconds = SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  const { data, error } = await getSupabaseClient()
    .storage.from(CUSTOMER_DOCUMENT_BUCKET)
    .createSignedUrl(path, expiresInSeconds)

  if (error) throw toAppError(error)
  return data.signedUrl
}

export { SIGNED_URL_TTL_SECONDS }
