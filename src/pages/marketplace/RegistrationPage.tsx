import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CarFront, KeyRound, Building2, UserRound, ArrowRight } from 'lucide-react'
import { AuthLayout } from '@/features/auth/components/AuthLayout'
import { getSupabaseClient } from '@/lib/supabase/client'
import { normalizePhone } from '@/features/marketplace/api'

const schema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your full name.').max(120),
    email: z.email('Enter a valid email.'),
    password: z.string().min(8, 'Use at least 8 characters.').max(72),
    confirmPassword: z.string(),
    businessName: z.string().max(120),
    businessPhone: z.string().max(32),
    whatsapp: z.string().max(32),
    country: z.string().length(2),
    region: z.string().max(120),
    city: z.string().max(120),
    address: z.string().max(500),
    description: z.string().max(4000),
    registration: z.string().max(120),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords must match.',
  })
type Values = z.infer<typeof schema>
export function RegistrationPage({ business = false }: { business?: boolean }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [service, setService] = useState(
    params.get('service') === 'rental' ? 'rental' : 'dealership',
  )
  const [error, setError] = useState('')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      confirmPassword: '',
      businessName: '',
      businessPhone: '',
      whatsapp: '',
      country: 'TZ',
      region: '',
      city: '',
      address: '',
      description: '',
      registration: '',
    },
  })
  const field = (name: keyof Values, label: string, type = 'text', required = false) => (
    <div>
      <label htmlFor={`register-${name}`}>
        {label}
        {required ? ' *' : ''}
      </label>
      <input className="sw-input" id={`register-${name}`} type={type} {...register(name)} />
      {errors[name] && (
        <p style={{ color: '#db1531', fontSize: 11, marginTop: 4 }}>{errors[name]?.message}</p>
      )}
    </div>
  )
  const submit = handleSubmit(async (values) => {
    setError('')
    if (
      business &&
      [values.businessName, values.city, values.businessPhone].some((v) => v.trim().length < 2)
    ) {
      setError('Enter your business name, phone, and city.')
      return
    }
    const whatsapp = values.whatsapp ? normalizePhone(values.whatsapp) : null
    const phone = values.businessPhone ? normalizePhone(values.businessPhone) : null
    if (business && (!phone || (values.whatsapp && !whatsapp))) {
      setError('Use a valid international phone number, such as +255 followed by your number.')
      return
    }
    const result = await getSupabaseClient().auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        emailRedirectTo: new URL('/auth/callback', window.location.origin).href,
        data: {
          full_name: values.fullName,
          account_type: business ? 'business' : 'customer',
          business_name: business ? values.businessName : undefined,
          service_type: business ? service : undefined,
          business_phone: phone,
          whatsapp_number_e164: whatsapp,
          country_code: values.country,
          region: values.region,
          city: values.city,
          business_address: values.address,
          business_description: values.description,
          registration_number: values.registration,
        },
      },
    })
    if (result.error) {
      setError(result.error.message)
      return
    }
    void navigate(result.data.session ? business ? '/provider/onboarding' : '/customer/dashboard' : '/confirm-email', {
      replace: true,
      state: { email: values.email },
    })
  })
  return (
    <AuthLayout
      title={business ? 'Bring your business to Swahivo' : 'Your next journey starts here'}
      description={
        business
          ? 'Create one business account for car sales, rental services, or both.'
          : 'Save your favorite vehicles, contact sellers, and request rental bookings.'
      }
      footer={
        <>
          Already have an account?{' '}
          <Link className="sw-link" to="/sign-in">
            Sign in
          </Link>
        </>
      }
    >
      <div className="sw-tabs" style={{ padding: 0, marginBottom: 24 }}>
        <Link
          to="/register/customer"
          className="sw-link"
          style={{ padding: '12px 0', color: business ? '#64748b' : '#ed102d' }}
        >
          <UserRound size={15} /> Customer
        </Link>
        <Link
          to="/register/business"
          className="sw-link"
          style={{ padding: '12px 0', color: business ? '#ed102d' : '#64748b' }}
        >
          <Building2 size={15} /> Business
        </Link>
      </div>
      <form onSubmit={(event) => void submit(event)} className="sw-form-grid">
        {error && (
          <p
            className="wide sw-notice"
            role="alert"
            style={{ background: '#fff0f2', color: '#bf1530' }}
          >
            {error}
          </p>
        )}
        <div className="wide">
          {field('fullName', business ? 'Owner name' : 'Your name', 'text', true)}
        </div>
        <div className="wide">{field('email', 'Email address', 'email', true)}</div>
        {field('password', 'Password', 'password', true)}
        {field('confirmPassword', 'Confirm password', 'password', true)}
        {business && (
          <>
            <div className="wide">
              <label>What services does your business provide?</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9 }}>
                {[
                  ['dealership', 'Car Dealership', CarFront],
                  ['rental', 'Car Rental', KeyRound],
                  ['both', 'Both Services', Building2],
                ].map(([value, label, Icon]) => {
                  const I = Icon as typeof CarFront
                  return (
                    <button
                      key={String(value)}
                      type="button"
                      className={`sw-service-choice ${service === value ? 'selected' : ''}`}
                      aria-pressed={service === value}
                      onClick={() => setService(String(value))}
                    >
                      <I size={20} style={{ marginBottom: 9 }} />
                      {String(label)}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="wide">{field('businessName', 'Business name', 'text', true)}</div>
            {field('businessPhone', 'Business phone', 'tel', true)}
            {field('whatsapp', 'WhatsApp number', 'tel')}
            {field('country', 'Country code', 'text', true)}
            {field('region', 'Region')}
            {field('city', 'City', 'text', true)}
            {field('registration', 'Registration number')}
            <div className="wide">{field('address', 'Business address')}</div>
            <div className="wide">
              <label htmlFor="business-description">About your business</label>
              <textarea
                id="business-description"
                className="sw-input"
                rows={3}
                {...register('description')}
              />
            </div>
            <div className="wide sw-notice">
              Your service selection is an application for access. A platform administrator must
              approve your business before you can publish listings. You can upload your logo and
              banner in business settings after approval.
            </div>
          </>
        )}
        <button className="sw-button wide" type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? 'Creating your account…'
            : business
              ? 'Submit Business Application'
              : 'Create Customer Account'}{' '}
          <ArrowRight size={15} />
        </button>
        <p className="wide" style={{ fontSize: 11, color: '#8190a4' }}>
          Your account uses secure email confirmation. Your password is never shared with providers.
        </p>
      </form>
    </AuthLayout>
  )
}
