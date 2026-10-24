import { detectImageType, signMediaUrl, signMediaUrls } from '@/features/vehicles/media'
import { sha256Hex } from '@/features/rentals/storage'
import { getSupabaseClient } from '@/lib/supabase/client'
import { AppError, toAppError } from '@/lib/supabase/errors'
import { SENSITIVE_FILE_CACHE_CONTROL } from '@/lib/supabase/storage'
import type { ExpenseAttachment, ExpenseDocumentKind } from '@/types/database'

/**
 * Receipts and invoices.
 *
 * The bucket is private. Object keys are `<organization_id>/<expense_id>/…` and
 * the storage policies read that leading segment, so the key *is* the access
 * check — a guessed path from another agency resolves to a refusal, not a file.
 * Nothing is ever served from a permanent public URL; the interface asks for a
 * short-lived signed URL at the moment somebody opens a document, and never for
 * a whole page of them at once.
 */

export const RECEIPT_BUCKET = 'expense-receipts'
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024

/**
 * SVG is absent on purpose. It is an executable document format, and accepting
 * it would put script content on the storage origin.
 */
export const RECEIPT_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
] as const

const EXTENSIONS: Readonly<Record<string, string>> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

function receiptKey(organizationId: string, expenseId: string, contentType: string): string {
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  return `${organizationId}/${expenseId}/${random}.${EXTENSIONS[contentType] ?? 'bin'}`
}

/** Keeps a recognisable name without letting a path or a control character in. */
function safeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'document'
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\x00-\x1F\x7F]/g, '').trim()
  return (cleaned === '' ? 'document' : cleaned).slice(0, 200)
}

export interface UploadReceiptInput {
  readonly organizationId: string
  readonly expenseId: string
  readonly file: File
  readonly kind: ExpenseDocumentKind
}

export async function uploadReceipt(input: UploadReceiptInput): Promise<ExpenseAttachment> {
  if (input.file.size > RECEIPT_MAX_BYTES) {
    throw new AppError('validation', 'Choose a file smaller than 10 MB.')
  }

  // A browser's File.type comes from the extension and is trivially wrong. For
  // an image the bytes decide; a PDF is checked by its own signature.
  const declaredPdf = input.file.type === 'application/pdf'
  const header = new Uint8Array(await input.file.slice(0, 5).arrayBuffer())
  const looksPdf =
    header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46

  let contentType: string | null
  if (declaredPdf || looksPdf) {
    if (!looksPdf) {
      throw new AppError('validation', 'That file is named as a PDF but is not one.')
    }
    contentType = 'application/pdf'
  } else {
    contentType = await detectImageType(input.file)
  }

  if (!contentType) {
    throw new AppError('validation', 'Attach a PDF, PNG, JPEG or WebP file.')
  }

  const supabase = getSupabaseClient()
  const path = receiptKey(input.organizationId, input.expenseId, contentType)

  const { error } = await supabase.storage.from(RECEIPT_BUCKET).upload(path, input.file, {
    contentType,
    cacheControl: SENSITIVE_FILE_CACHE_CONTROL,
    upsert: false,
  })

  if (error) throw toAppError(error)

  const checksum = await sha256Hex(await input.file.arrayBuffer())

  const { data, error: metadataError } = await supabase
    .from('expense_attachments')
    .insert({
      organization_id: input.organizationId,
      expense_id: input.expenseId,
      kind: input.kind,
      storage_path: path,
      file_name: safeFileName(input.file.name),
      content_type: contentType,
      byte_size: input.file.size,
      sha256: checksum,
    })
    .select()
    .single()

  if (metadataError) {
    // Do not leave an orphaned object behind if the metadata write is refused.
    await supabase.storage.from(RECEIPT_BUCKET).remove([path])
    throw toAppError(metadataError)
  }

  return data
}

export async function fetchAttachments(expenseId: string): Promise<ExpenseAttachment[]> {
  const { data, error } = await getSupabaseClient()
    .from('expense_attachments')
    .select('*')
    .eq('expense_id', expenseId)
    .order('uploaded_at', { ascending: true })

  if (error) throw toAppError(error)
  return data ?? []
}

export async function deleteAttachment(attachment: ExpenseAttachment): Promise<void> {
  const supabase = getSupabaseClient()

  const { error } = await supabase.from('expense_attachments').delete().eq('id', attachment.id)
  if (error) throw toAppError(error)

  // Row first, file second: an orphaned file is invisible and cheap, whereas a
  // row pointing at a deleted file renders as a broken document.
  await supabase.storage.from(RECEIPT_BUCKET).remove([attachment.storage_path])
}

/** A short-lived URL, minted only when somebody actually opens a document. */
export function signReceiptUrl(path: string, expiresInSeconds?: number): Promise<string> {
  return signMediaUrl(RECEIPT_BUCKET, path, expiresInSeconds)
}

export function signReceiptUrls(
  paths: readonly string[],
  expiresInSeconds?: number,
): Promise<Map<string, string>> {
  return signMediaUrls(RECEIPT_BUCKET, paths, expiresInSeconds)
}

/** Whether the same document has already been filed against another cost. */
export async function findAttachmentByHash(
  organizationId: string,
  sha256: string,
  excludeExpenseId?: string,
): Promise<ExpenseAttachment[]> {
  let request = getSupabaseClient()
    .from('expense_attachments')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('sha256', sha256)

  if (excludeExpenseId) request = request.neq('expense_id', excludeExpenseId)

  const { data, error } = await request.limit(5)
  if (error) throw toAppError(error)
  return data ?? []
}
