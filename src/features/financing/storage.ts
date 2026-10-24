import { sha256Hex } from '@/features/rentals/storage'
import { detectImageType, signMediaUrl } from '@/features/vehicles/media'
import { getSupabaseClient } from '@/lib/supabase/client'
import { AppError, toAppError } from '@/lib/supabase/errors'
import { SENSITIVE_FILE_CACHE_CONTROL } from '@/lib/supabase/storage'
import type { FinancingDocument, FinancingDocumentKind } from '@/types/database'

/**
 * Loan agreements, lender statements and payoff letters.
 *
 * The bucket is private and object keys are `<organization_id>/<agreement_id>/…`;
 * the storage policies read that leading segment, so the key *is* the access
 * check. A guessed path from another agency resolves to a refusal rather than a
 * contract. Nothing is served from a permanent URL — a short-lived signed URL is
 * minted at the moment somebody opens a document, and never for a whole list.
 *
 * Writing is an administrator's privilege here rather than a manager's, because
 * a financing document is the evidence behind a balance.
 */

export const FINANCING_BUCKET = 'financing-documents'
export const FINANCING_MAX_BYTES = 10 * 1024 * 1024

/** SVG is absent on purpose: it is executable and would sit on the storage origin. */
export const FINANCING_MIME_TYPES = [
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

function documentKey(organizationId: string, agreementId: string, contentType: string): string {
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  return `${organizationId}/${agreementId}/${random}.${EXTENSIONS[contentType] ?? 'bin'}`
}

/** Keeps a recognisable name without letting a path or a control character in. */
function safeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'document'
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\x00-\x1F\x7F]/g, '').trim()
  return (cleaned === '' ? 'document' : cleaned).slice(0, 200)
}

export interface UploadFinancingDocumentInput {
  readonly organizationId: string
  readonly agreementId: string
  readonly file: File
  readonly kind: FinancingDocumentKind
  readonly documentOn?: string | null
  readonly reference?: string | null
}

export async function uploadFinancingDocument(
  input: UploadFinancingDocumentInput,
): Promise<FinancingDocument> {
  if (input.file.size > FINANCING_MAX_BYTES) {
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
  const path = documentKey(input.organizationId, input.agreementId, contentType)

  const { error } = await supabase.storage.from(FINANCING_BUCKET).upload(path, input.file, {
    contentType,
    cacheControl: SENSITIVE_FILE_CACHE_CONTROL,
    upsert: false,
  })

  if (error) throw toAppError(error)

  const checksum = await sha256Hex(await input.file.arrayBuffer())

  const { data, error: metadataError } = await supabase
    .from('financing_documents')
    .insert({
      organization_id: input.organizationId,
      agreement_id: input.agreementId,
      kind: input.kind,
      storage_path: path,
      file_name: safeFileName(input.file.name),
      content_type: contentType,
      byte_size: input.file.size,
      sha256: checksum,
      document_on: input.documentOn ?? null,
      reference: input.reference ?? null,
    })
    .select()
    .single()

  if (metadataError) {
    // Do not leave an orphaned object behind if the metadata write is refused.
    await supabase.storage.from(FINANCING_BUCKET).remove([path])
    throw toAppError(metadataError)
  }

  return data
}

export async function fetchFinancingDocuments(agreementId: string): Promise<FinancingDocument[]> {
  const { data, error } = await getSupabaseClient()
    .from('financing_documents')
    .select('*')
    .eq('agreement_id', agreementId)
    .order('uploaded_at', { ascending: false })

  if (error) throw toAppError(error)
  return data ?? []
}

export async function deleteFinancingDocument(document: FinancingDocument): Promise<void> {
  const supabase = getSupabaseClient()

  const { error } = await supabase.from('financing_documents').delete().eq('id', document.id)
  if (error) throw toAppError(error)

  // Row first, file second: an orphaned file is invisible and cheap, whereas a
  // row pointing at a deleted file renders as a broken document.
  await supabase.storage.from(FINANCING_BUCKET).remove([document.storage_path])
}

/** A short-lived URL, minted only when somebody actually opens a document. */
export function signFinancingDocumentUrl(path: string, expiresInSeconds?: number): Promise<string> {
  return signMediaUrl(FINANCING_BUCKET, path, expiresInSeconds)
}
