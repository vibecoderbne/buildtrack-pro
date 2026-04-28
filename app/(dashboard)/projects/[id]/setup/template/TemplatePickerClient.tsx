'use client'

import { useTransition } from 'react'
import { seedFullTemplate, seedBasicTemplate, seedOwnTemplate } from '@/app/actions/setup'

interface Props {
  projectId: string
  startDate: string
}

const cards = [
  {
    key: 'own' as const,
    title: 'Build your own',
    description: 'Start from scratch with a blank phase and task. Build your programme exactly the way you want it.',
    icon: '✏️',
    featured: false,
    badge: null,
  },
  {
    key: 'basic' as const,
    title: 'Basic template',
    description: 'All 7 standard residential renovation phases, no tasks. Fill in your own tasks under each phase.',
    icon: '📋',
    featured: false,
    badge: '7 phases',
  },
  {
    key: 'full' as const,
    title: 'Full template',
    description: 'The complete standard residential renovation programme — 7 phases and 22 pre-built tasks.',
    icon: '🏗️',
    featured: true,
    badge: '7 phases · 22 tasks',
  },
]

export default function TemplatePickerClient({ projectId, startDate }: Props) {
  const [isPending, startTransition] = useTransition()

  function pick(key: 'own' | 'basic' | 'full') {
    startTransition(async () => {
      if (key === 'full') await seedFullTemplate(projectId, startDate)
      else if (key === 'basic') await seedBasicTemplate(projectId)
      else await seedOwnTemplate(projectId, startDate)
    })
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12" style={{ background: 'var(--bg)' }}>
      <div className="max-w-3xl w-full">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>Choose a starting point</h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-3)' }}>
            Pick a template for your project plan. You can edit everything in the next step.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {cards.map((card) => (
            <button
              key={card.key}
              onClick={() => pick(card.key)}
              disabled={isPending}
              className="relative flex flex-col gap-3 rounded-xl border-2 p-6 text-left transition-all focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                background: 'var(--surface)',
                borderColor: card.featured ? 'var(--accent)' : 'var(--border)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <span className="text-3xl">{card.icon}</span>
              <div>
                <p className="text-base font-semibold" style={{ color: 'var(--ink)' }}>{card.title}</p>
                {card.badge && (
                  <span
                    className="mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                  >
                    {card.badge}
                  </span>
                )}
                <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--ink-3)' }}>{card.description}</p>
              </div>
              {isPending && (
                <span className="absolute inset-0 flex items-center justify-center rounded-xl text-sm" style={{ background: 'rgba(255,255,255,0.7)', color: 'var(--ink-4)' }}>
                  Loading…
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
