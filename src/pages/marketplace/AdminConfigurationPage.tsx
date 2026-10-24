import { fieldText } from '@/features/marketplace/api'
import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { marketplaceClient, rpc } from '@/features/marketplace/api'
import { DashboardHeading } from './DashboardShell'
import { EmptyMarketplace } from './MarketplacePage'

export function AdminConfigurationPage({
  module,
}: {
  module: 'brands' | 'categories' | 'content' | 'marketing' | 'users' | 'fleet'
}) {
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const kind = module === 'brands' ? 'brand' : module === 'categories' ? 'category' : module
  const configuration = !['users', 'fleet'].includes(module)
  const config = useQuery({
    queryKey: ['swahivo', 'configuration', kind],
    enabled: configuration,
    queryFn: async () => {
      const r = await marketplaceClient()
        .from('marketplace_configuration')
        .select('*')
        .eq('kind', kind)
        .order('created_at', { ascending: false })
      if (r.error) throw r.error
      return r.data ?? []
    },
  })
  const records = useQuery({
    queryKey: ['swahivo', 'admin-records', module],
    enabled: !configuration,
    queryFn: () =>
      rpc<Array<Record<string, unknown>>>(
        module === 'users' ? 'marketplace_admin_users' : 'marketplace_admin_fleet',
      ),
  })
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const d = new FormData(event.currentTarget)
    const r = await marketplaceClient()
      .from('marketplace_configuration')
      .insert({
        kind,
        name: fieldText(d.get('name')),
        description: fieldText(d.get('description')),
        published: d.get('published') === 'on',
      })
    if (r.error) setError(r.error.message)
    else {
      setCreating(false)
      await config.refetch()
    }
  }
  const titles = {
    brands: 'Vehicle Brands',
    categories: 'Vehicle Categories',
    content: 'Website Content',
    marketing: 'Marketing Content',
    users: 'Platform Users',
    fleet: 'Rental Fleet Oversight',
  }
  return (
    <>
      <DashboardHeading
        title={titles[module]}
        description={
          module === 'fleet'
            ? 'Operational fleet fields only. Private identity documents and GPS positions remain provider-scoped.'
            : 'Manage actual Swahivo records with platform administrator permissions.'
        }
        action={
          configuration ? (
            <button className="sw-button" onClick={() => setCreating(!creating)}>
              <Plus size={16} />
              Add Record
            </button>
          ) : undefined
        }
      />
      {error && (
        <p role="alert" className="sw-notice" style={{ marginBottom: 20, color: '#c11' }}>
          {error}
        </p>
      )}
      {creating && (
        <form
          className="sw-panel sw-form-grid"
          style={{ marginBottom: 22 }}
          onSubmit={(e) => void create(e)}
        >
          <div className="wide">
            <label htmlFor="config-name">Name / title</label>
            <input className="sw-input" name="name" id="config-name" required maxLength={160} />
          </div>
          <div className="wide">
            <label htmlFor="config-description">Description / content</label>
            <textarea className="sw-input" name="description" id="config-description" rows={4} />
          </div>
          <label className="wide flex gap-2">
            <input type="checkbox" name="published" />
            Publish this record
          </label>
          <button className="sw-button wide">Save Record</button>
        </form>
      )}
      <div className="sw-panel" style={{ overflowX: 'auto' }}>
        {config.error || records.error ? (
          <p role="alert">{config.error?.message ?? records.error?.message}</p>
        ) : configuration ? (
          config.data?.length ? (
            <table className="sw-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {config.data.map((record) => (
                  <tr key={record.id}>
                    <td>{record.name}</td>
                    <td style={{ whiteSpace: 'pre-wrap' }}>{record.description}</td>
                    <td>{record.published ? 'Published' : 'Draft'}</td>
                    <td>
                      <button
                        className="sw-link"
                        onClick={() => {
                          void marketplaceClient()
                            .from('marketplace_configuration')
                            .update({ published: !record.published })
                            .eq('id', record.id)
                            .then((r) => {
                              if (r.error) setError(r.error.message)
                              else void config.refetch()
                            })
                        }}
                      >
                        {record.published ? 'Unpublish' : 'Publish'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyMarketplace title={`No ${module} records yet`}>
              Create your first record. New content is private until you publish it.
            </EmptyMarketplace>
          )
        ) : records.data?.length ? (
          <table className="sw-table">
            <thead>
              <tr>
                {(module === 'users'
                  ? ['Name', 'Email', 'Confirmed', 'Platform Admin']
                  : ['Business', 'Vehicle', 'Registration', 'Status']
                ).map((title) => (
                  <th key={title}>{title}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.data.map((record, index) => (
                <tr key={fieldText(record.id ?? index)}>
                  {(module === 'users'
                    ? [
                        record.full_name,
                        record.email,
                        record.confirmed ? 'Yes' : 'No',
                        record.platform_admin ? 'Yes' : 'No',
                      ]
                    : [
                        record.business_name,
                        `${fieldText(record.make)} ${fieldText(record.model)}`,
                        record.registration_plate,
                        record.status,
                      ]
                  ).map((value, i) => (
                    <td key={i}>{fieldText(value ?? '—')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyMarketplace title="No records found">
            This view contains only authorized records from the live database.
          </EmptyMarketplace>
        )}
      </div>
    </>
  )
}
