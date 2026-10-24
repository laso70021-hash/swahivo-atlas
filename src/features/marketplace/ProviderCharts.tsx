import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

export function ProviderTrendChart({
  enquiries,
  orders = [],
}: {
  enquiries: Array<{ created_at: string }>
  orders?: Array<{ created_at: string; status: string }>
}) {
  const data = Array.from({ length: 12 }, (_, i) => {
    const date = new Date()
    date.setDate(1)
    date.setMonth(date.getMonth() - 11 + i)
    const sameMonth = (created: string) => {
      const d = new Date(created)
      return d.getMonth() === date.getMonth() && d.getFullYear() === date.getFullYear()
    }
    return {
      month: date.toLocaleDateString('en', { month: 'short' }),
      Enquiries: enquiries.filter((e) => sameMonth(e.created_at)).length,
      Sales: orders.filter((o) => o.status === 'completed' && sameMonth(o.created_at)).length,
    }
  })
  return (
    <div style={{ height: 240, width: '100%' }} aria-label="Monthly enquiries and completed sales">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: -22, right: 12, top: 16, bottom: 0 }}>
          <defs>
            <linearGradient id="swahivo-enquiries" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff1838" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#ff1838" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e8eef6" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 10, fill: '#7c8da5' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 10, fill: '#7c8da5' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e1e8f2', fontSize: 12 }} />
          <Area
            type="monotone"
            dataKey="Enquiries"
            stroke="#ff1838"
            fill="url(#swahivo-enquiries)"
            strokeWidth={2.5}
          />
          <Area
            type="monotone"
            dataKey="Sales"
            stroke="#2389fa"
            fill="transparent"
            strokeWidth={2.5}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
export function ListingStatusChart({ offers }: { offers: Array<{ status: string }> }) {
  const states = [
    {
      name: 'Published',
      value: offers.filter((o) => o.status === 'published').length,
      color: '#12bf75',
    },
    {
      name: 'Pending',
      value: offers.filter((o) => o.status === 'pending').length,
      color: '#ffac27',
    },
    {
      name: 'Other',
      value: offers.filter((o) => !['published', 'pending'].includes(o.status)).length,
      color: '#ff2442',
    },
  ]
  if (!offers.length)
    return (
      <p style={{ fontSize: 12, color: '#7b8da5', padding: '35px 0' }}>
        Your listing status breakdown appears once you add vehicles.
      </p>
    )
  return (
    <div>
      <div style={{ height: 165, position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={states} dataKey="value" innerRadius={52} outerRadius={72} stroke="none">
              {states.map((s) => (
                <Cell key={s.name} fill={s.color} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            pointerEvents: 'none',
            fontSize: 25,
            fontWeight: 800,
          }}
        >
          {offers.length}
        </div>
      </div>
      <div style={{ display: 'grid', gap: 7, fontSize: 11 }}>
        {states.map((s) => (
          <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>
              <i
                style={{
                  display: 'inline-block',
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: s.color,
                  marginRight: 7,
                }}
              />
              {s.name}
            </span>
            <strong>{s.value}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}
