import { describe, it, expect } from 'vitest'
import { normalizePhone, whatsappUrl, type Offer } from './api'

describe('Provider WhatsApp destinations', () => {
  it.each([
    ['0712345678', '+255712345678'],
    ['+255 712 345 678', '+255712345678'],
    ['00254 712 345 678', '+254712345678'],
    ['+44 (20) 7946-0958', '+442079460958'],
  ])('normalizes %s', (value, expected) => expect(normalizePhone(value)).toBe(expected))
  it.each([
    'javascript:alert(1)',
    'https://wa.me/255712345678',
    '123',
    '+00000000',
    '+255<script>123456789</script>',
  ])('rejects non-phone input %s', (value) => expect(normalizePhone(value)).toBeNull())
  const base = {
    title: 'Toyota RAV4',
    slug: 'toyota-rav4',
    service: 'dealership',
    whatsapp_enabled: true,
    whatsapp_number_e164: '+255712345678',
  } as Offer
  it('uses the owning provider number and actual sale URL', () => {
    const result = new URL(whatsappUrl(base)!)
    expect(result.origin).toBe('https://wa.me')
    expect(result.pathname).toBe('/255712345678')
    expect(result.searchParams.get('text')).toContain(
      new URL('/cars/toyota-rav4', window.location.origin).href,
    )
  })
  it('keeps rental dates and its rental URL in the message', () => {
    const result = new URL(whatsappUrl({ ...base, service: 'rental' }, '2026-11-02', '2026-11-05')!)
    expect(result.searchParams.get('text')).toContain('from 2026-11-02 to 2026-11-05')
    expect(result.searchParams.get('text')).toContain('/rentals/toyota-rav4')
  })
  it('does not invent a destination when a provider has no enabled contact', () => {
    expect(whatsappUrl({ ...base, whatsapp_number_e164: null })).toBeNull()
    expect(whatsappUrl({ ...base, whatsapp_enabled: false })).toBeNull()
  })
})
