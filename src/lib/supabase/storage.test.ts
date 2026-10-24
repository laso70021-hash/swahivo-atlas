import { beforeEach, describe, expect, it, vi } from 'vitest'

import { uploadCustomerDocumentFile } from '@/features/customers/documents'
import { uploadReceipt } from '@/features/expenses/storage'
import { uploadFinancingDocument } from '@/features/financing/storage'
import { storeContractPdf, storeSignature, uploadConditionPhoto } from '@/features/rentals/storage'
import { uploadVehicleDocumentFile } from '@/features/vehicles/media'
import type { CustomerDocument } from '@/types/database'

import { SENSITIVE_FILE_CACHE_CONTROL } from './storage'

interface UploadCall {
  bucket: string
  options: Record<string, unknown>
}

const uploads: UploadCall[] = []

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient: () => ({
    storage: {
      from: (bucket: string) => ({
        upload: (path: string, _body: unknown, options: Record<string, unknown>) => {
          uploads.push({ bucket, options })
          return Promise.resolve({ data: { path }, error: null })
        },
        remove: () => Promise.resolve({ data: [], error: null }),
      }),
    },
    // Any table query: every builder method chains, and awaiting it succeeds.
    from: () => {
      const result = { data: { id: 'row-1' }, error: null }
      const chain: Record<string, unknown> = {}
      const proxy: unknown = new Proxy(chain, {
        get: (_target, key) =>
          key === 'then'
            ? (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
            : () => proxy,
      })
      return proxy
    },
  }),
}))

vi.mock('@/features/customers/api', () => ({
  updateCustomerDocument: () => Promise.resolve({}),
}))

const PDF_BYTES = '%PDF-1.4\n% fictional\n'
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

const pdf = () => new File([PDF_BYTES], 'file.pdf', { type: 'application/pdf' })
const png = () => new File([PNG_BYTES], 'photo.png', { type: 'image/png' })

describe('sensitive uploads', () => {
  beforeEach(() => {
    uploads.length = 0
  })

  it('never lets a cache keep a file past its signed URL', () => {
    expect(SENSITIVE_FILE_CACHE_CONTROL).toBe('0')
  })

  it.each([
    [
      'contract PDF',
      () =>
        storeContractPdf({
          organizationId: 'org-1',
          rentalId: 'rental-1',
          contractId: 'contract-1',
          version: 1,
          bytes: new Blob([PDF_BYTES], { type: 'application/pdf' }),
        }),
    ],
    ['contract signature', () => storeSignature('org-1', 'rental-1', png())],
    [
      'condition photo',
      () =>
        uploadConditionPhoto({
          organizationId: 'org-1',
          rentalId: 'rental-1',
          phase: 'pickup',
          file: png(),
          caption: null,
        }),
    ],
    [
      'customer identification scan',
      () =>
        uploadCustomerDocumentFile({
          organizationId: 'org-1',
          customerId: 'customer-1',
          document: { id: 'document-1' } as CustomerDocument,
          file: pdf(),
        }),
    ],
    [
      'vehicle document',
      () =>
        uploadVehicleDocumentFile({
          organizationId: 'org-1',
          vehicleId: 'vehicle-1',
          documentId: 'document-1',
          file: pdf(),
        }),
    ],
    [
      'expense receipt',
      () =>
        uploadReceipt({
          organizationId: 'org-1',
          expenseId: 'expense-1',
          file: pdf(),
          kind: 'receipt',
        }),
    ],
    [
      'financing document',
      () =>
        uploadFinancingDocument({
          organizationId: 'org-1',
          agreementId: 'agreement-1',
          file: pdf(),
          kind: 'agreement',
        }),
    ],
  ])('uploads a %s with the sensitive cache policy', async (_name, upload) => {
    await upload().catch(() => undefined)

    expect(uploads).toHaveLength(1)
    expect(uploads[0]!.options.cacheControl).toBe(SENSITIVE_FILE_CACHE_CONTROL)
  })
})
