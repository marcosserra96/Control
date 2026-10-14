import {
  ArrowLeftRight, Baby, BookOpen, Briefcase, Car, Circle, Coffee, CreditCard, Dog, Dumbbell, Fuel, Gift,
  GraduationCap, HeartPulse, Home, Landmark, Laptop, Plane, PartyPopper, PiggyBank, Repeat, Shirt,
  ShoppingBag, ShoppingCart, Smartphone, Sparkles, TrendingUp, Utensils, Wallet, Wrench, Zap,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/cn'

/** Ícones disponíveis para categorias. A chave é o que fica gravado no banco. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  home: Home, 'shopping-cart': ShoppingCart, utensils: Utensils, coffee: Coffee, car: Car, fuel: Fuel,
  plane: Plane, 'heart-pulse': HeartPulse, dumbbell: Dumbbell, 'graduation-cap': GraduationCap,
  'book-open': BookOpen, 'party-popper': PartyPopper, repeat: Repeat, 'shopping-bag': ShoppingBag,
  shirt: Shirt, zap: Zap, smartphone: Smartphone, wrench: Wrench, gift: Gift, dog: Dog, baby: Baby,
  sparkles: Sparkles, briefcase: Briefcase, laptop: Laptop, 'trending-up': TrendingUp,
  'piggy-bank': PiggyBank, landmark: Landmark, wallet: Wallet, 'credit-card': CreditCard, circle: Circle,
}

export const CATEGORY_COLORS = [
  '#7C8CF8', '#5CCF9B', '#FF9F5A', '#4FB8E8', '#FF7B9C', '#B98CF5',
  '#F2D45C', '#E37BD8', '#F07E6E', '#6FD0C8', '#E3AE4A', '#8B93A5',
]

export function CategoryIcon({
  icon, color, size = 'md', className,
}: {
  icon?: string | null
  color?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const Icon = (icon && CATEGORY_ICONS[icon]) || Circle
  const dims = { sm: 'size-8 rounded-[10px]', md: 'size-10 rounded-xl', lg: 'size-12 rounded-2xl' }[size]
  const iconSize = { sm: 'size-4', md: 'size-[18px]', lg: 'size-5' }[size]
  const c = color ?? '#8B93A5'
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center', dims, className)}
      style={{ background: `color-mix(in srgb, ${c} 16%, transparent)`, color: c }}
      aria-hidden
    >
      <Icon className={iconSize} strokeWidth={2.2} />
    </span>
  )
}

export function TransferIcon({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center bg-raised text-muted',
        size === 'sm' ? 'size-8 rounded-[10px]' : 'size-10 rounded-xl',
      )}
      aria-hidden
    >
      <ArrowLeftRight className="size-[18px]" strokeWidth={2.2} />
    </span>
  )
}
