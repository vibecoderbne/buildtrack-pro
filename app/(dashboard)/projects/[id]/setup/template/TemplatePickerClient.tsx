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
    accent: 'border-gray-300 hover:border-indigo-400',
    badge: null,
  },
  {
    key: 'basic' as const,
    title: 'Basic template',
    description: 'All 16 standard residential build phases, no tasks. Fill in your own tasks under each phase.',
    icon: '📋',
    accent: 'border-gray-300 hover:border-indigo-400',
    badge: '16 phases',
  },
  {
    key: 'full' as const,
    title: 'Full template',
    description: 'The complete standard residential build programme — 16 phases and ~98 pre-built tasks with durations.',
    icon: '🏗️',
    accent: 'border-indigo-400 hover:border-indigo-600',
    badge: '16 phases · ~98 tasks',
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
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-gray-50">
      <div className="max-w-3xl w-full">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Choose a starting point</h1>
          <p className="mt-2 text-sm text-gray-500">
            Pick a template for your project plan. You can edit everything in the next step.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {cards.map((card) => (
            <button
              key={card.key}
              onClick={() => pick(card.key)}
              disabled={isPending}
              className={`relative flex flex-col gap-3 rounded-xl border-2 bg-white p-6 text-left shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-60 disabled:cursor-not-allowed ${card.accent}`}
            >
              <span className="text-3xl">{card.icon}</span>
              <div>
                <p className="text-base font-semibold text-gray-900">{card.title}</p>
                {card.badge && (
                  <span className="mt-1 inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                    {card.badge}
                  </span>
                )}
                <p className="mt-2 text-sm text-gray-500 leading-relaxed">{card.description}</p>
              </div>
              {isPending && (
                <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/70 text-sm text-gray-400">
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
