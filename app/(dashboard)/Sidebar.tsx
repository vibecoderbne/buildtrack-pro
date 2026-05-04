'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout } from '@/app/actions/auth'
import { Wordmark } from '@/components/brand/Logo'
import type { UserRole } from '@/lib/types'

const navItems: { label: string; href: string; roles: UserRole[] }[] = [
  { label: 'Dashboard', href: '/dashboard', roles: ['consultant', 'builder'] },
  { label: 'Projects', href: '/projects', roles: ['consultant', 'builder'] },
  { label: 'Templates', href: '/templates', roles: ['consultant', 'builder'] },
]

export default function Sidebar({
  userRole,
  userName,
}: {
  userRole: UserRole
  userName: string
}) {
  const pathname = usePathname()

  const visibleItems = navItems.filter((item) => item.roles.includes(userRole))

  return (
    <aside
      className="w-60 flex-shrink-0 flex flex-col"
      style={{ background: 'var(--ink)', color: 'var(--bg)' }}
    >
      {/* Logo */}
      <div className="px-6 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <Wordmark size={15} weight={600} color="var(--bg)" accent="var(--accent-soft)" />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {visibleItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors"
              style={isActive
                ? { background: 'var(--accent)', color: '#fff' }
                : { color: 'rgba(255,255,255,0.65)' }
              }
              onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLElement).style.color = '#fff' } }}
              onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = ''; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.65)' } }}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="px-3 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="px-3 py-2 mb-1">
          <p className="text-sm font-medium truncate" style={{ color: '#fff' }}>{userName}</p>
          <p className="text-xs capitalize" style={{ color: 'rgba(255,255,255,0.45)' }}>{userRole}</p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="w-full text-left px-3 py-2 rounded-md text-sm transition-colors"
            style={{ color: 'rgba(255,255,255,0.65)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLElement).style.color = '#fff' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.65)' }}
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  )
}
