'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout } from '@/app/actions/auth'
import type { UserRole } from '@/lib/types'

const navItems: { label: string; href: string; roles: UserRole[] }[] = [
  { label: 'Dashboard', href: '/dashboard', roles: ['consultant', 'builder'] },
  { label: 'Projects', href: '/projects', roles: ['consultant', 'builder'] },
  { label: 'My Tasks', href: '/my-tasks', roles: ['subcontractor'] },
  { label: 'My Home', href: '/my-home', roles: ['homeowner'] },
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
    <aside className="w-60 flex-shrink-0 bg-gray-900 text-white flex flex-col">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-gray-700">
        <span className="text-lg font-bold tracking-tight">ProgressBuild</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {visibleItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="px-3 py-4 border-t border-gray-700">
        <div className="px-3 py-2 mb-1">
          <p className="text-sm font-medium text-white truncate">{userName}</p>
          <p className="text-xs text-gray-400 capitalize">{userRole}</p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  )
}
