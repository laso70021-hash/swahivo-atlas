import { Link } from 'react-router-dom'

import { paths } from '@/app/routes/paths'
import { Wordmark } from '@/components/brand/Wordmark'
import { PRODUCT_BRAND } from '@/lib/config/brand'

/**
 * Restrained by design — this is the one place creator attribution appears on
 * the public site, and it stays a footer line, never a promotion. See
 * src/lib/config/brand.ts for why the product name and the creator name are
 * kept apart.
 */
export function MarketingFooter() {
  const currentYear = new Date().getFullYear()
  return (
    <footer className="border-line border-t">
      <div className="mx-auto max-w-[1220px] px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div className="space-y-2">
            <Wordmark />
            <p className="text-ink-muted max-w-sm text-[0.8125rem]">
              Buy, sell and rent vehicles with Swahivo. East Africa based Zanzibar, Tanzania.
            </p>
          </div>

          <nav aria-label="Account" className="flex items-center gap-5">
            <Link
              to={paths.signIn}
              className="text-ink-muted hover:text-ink text-[0.8125rem] font-medium transition-colors"
            >
              Sign in
            </Link>
            <Link
              to={paths.signUp}
              className="text-ink-muted hover:text-ink text-[0.8125rem] font-medium transition-colors"
            >
              Create agency account
            </Link>
          </nav>
        </div>

        <div className="border-line mt-8 border-t pt-6">
          <p className="text-ink-subtle text-[0.75rem]">
            © {currentYear} {PRODUCT_BRAND.attribution}
          </p>
        </div>
      </div>
    </footer>
  )
}
