import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils/cn'
export interface WordmarkProps {
  tone?: 'default' | 'inverse'
  size?: 'default' | 'lg'
  className?: string
}
export function Wordmark({ tone = 'default', size = 'default', className }: WordmarkProps) {
  return (
    <Link to="/" aria-label="Swahivo Homepage">
      <img
        src={tone === 'inverse' ? '/swahivo/logo-dark.png' : '/swahivo/logo.png'}
        alt="Swahivo — Car Dealership"
        className={cn('object-contain', size === 'lg' ? 'h-16 w-52' : 'h-12 w-40', className)}
      />
    </Link>
  )
}
