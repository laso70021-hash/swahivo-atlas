import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ToastProvider } from '@/components/ui'

import { createVehicle } from '../api'
import type * as VehicleQueries from '../queries'
import { vehicleKeys } from '../queries'

import { VehicleImportDialog } from './VehicleImportDialog'

vi.mock('@/features/workspace/workspace-context', () => ({
  useOrganization: () => ({ id: 'org-1', default_currency: 'USD' }),
}))

vi.mock('../api', () => ({
  createVehicle: vi.fn(() => Promise.resolve({})),
}))

vi.mock('../queries', async (importOriginal) => ({
  ...(await importOriginal<typeof VehicleQueries>()),
  useVehicleList: () => ({ data: { rows: [] } }),
}))

const CSV = [
  'make,model,registration_plate,daily_rate,odometer',
  'Toyota,Yaris,IMP-001,35,12000',
  'Dacia,Logan,IMP-002,28,45000',
].join('\n')

describe('VehicleImportDialog', () => {
  // Regression: an import used to leave the fleet list showing its stale,
  // pre-import result until the page was reloaded.
  it('refreshes the fleet once the import has written vehicles', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const user = userEvent.setup()

    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <VehicleImportDialog open onOpenChange={() => undefined} />
        </ToastProvider>
      </QueryClientProvider>,
    )

    const input = document.querySelector<HTMLInputElement>('input[type="file"]')
    expect(input).not.toBeNull()
    await user.upload(input!, new File([CSV], 'fleet.csv', { type: 'text/csv' }))

    await user.click(await screen.findByRole('button', { name: 'Import 2 vehicles' }))

    await waitFor(() => expect(createVehicle).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: vehicleKeys.all('org-1') }),
    )
  })
})
