// Default residential renovation template — 7 phases, 22 tasks.
// The builder will refine task names and durations to match their actual programme.
// Durations are in working days (Mon–Fri).

export interface TemplateTask {
  name: string
  duration_days: number
  trade: string | null
  is_milestone: boolean
}

export interface TemplatePhase {
  name: string
  color: string
  tasks: TemplateTask[]
}

export interface DefaultTemplate {
  name: string
  description: string
  phases: TemplatePhase[]
}

export const DEFAULT_TEMPLATE: DefaultTemplate = {
  name: 'Standard Residential Renovation',
  description: '7-phase residential renovation programme',
  phases: [
    {
      name: 'Pre-Construction',
      color: '#6366f1',
      tasks: [
        { name: 'Site management & administration',       duration_days: 2, trade: 'Builder',     is_milestone: false },
        { name: 'Site establishment & temporary services', duration_days: 2, trade: 'Builder',     is_milestone: false },
        { name: 'Site survey & set out',                  duration_days: 2, trade: 'Surveyor',    is_milestone: false },
      ],
    },
    {
      name: 'Demolition & Site Prep',
      color: '#ef4444',
      tasks: [
        { name: 'Internal demolition',       duration_days: 2, trade: 'Builder', is_milestone: false },
        { name: 'Structural alterations',    duration_days: 2, trade: 'Builder', is_milestone: false },
        { name: 'Site clean & waste removal', duration_days: 2, trade: 'Builder', is_milestone: false },
      ],
    },
    {
      name: 'Structure & Roofing',
      color: '#f97316',
      tasks: [
        { name: 'Framing & structural carpentry', duration_days: 2, trade: 'Carpenter', is_milestone: false },
        { name: 'Roof framing & sarking',          duration_days: 2, trade: 'Carpenter', is_milestone: false },
        { name: 'Roofing (tiles/metal)',            duration_days: 2, trade: 'Roofer',    is_milestone: false },
      ],
    },
    {
      name: 'Lock-Up',
      color: '#eab308',
      tasks: [
        { name: 'Windows & external doors',          duration_days: 2, trade: 'Carpenter', is_milestone: false },
        { name: 'External cladding & weatherproofing', duration_days: 2, trade: 'Builder',   is_milestone: false },
        { name: 'Garage door & lock-up inspection',  duration_days: 2, trade: 'Builder',   is_milestone: false },
      ],
    },
    {
      name: 'Rough-In Services',
      color: '#06b6d4',
      tasks: [
        { name: 'Plumbing rough-in',  duration_days: 2, trade: 'Plumber',     is_milestone: false },
        { name: 'Electrical rough-in', duration_days: 2, trade: 'Electrician', is_milestone: false },
        { name: 'HVAC rough-in',       duration_days: 2, trade: 'HVAC',        is_milestone: false },
      ],
    },
    {
      name: 'Fit-Out & Finishes',
      color: '#8b5cf6',
      tasks: [
        { name: 'Insulation & plasterboard',          duration_days: 2, trade: 'Plasterer', is_milestone: false },
        { name: 'Internal doors, skirts & architraves', duration_days: 2, trade: 'Carpenter', is_milestone: false },
        { name: 'Tiling & wet area finishes',          duration_days: 2, trade: 'Tiler',     is_milestone: false },
        { name: 'Cabinetry, benchtops & joinery',      duration_days: 2, trade: 'Carpenter', is_milestone: false },
      ],
    },
    {
      name: 'Completion',
      color: '#10b981',
      tasks: [
        { name: 'Painting (internal & external)',     duration_days: 2, trade: 'Painter', is_milestone: false },
        { name: 'Fixtures, fittings & appliances',    duration_days: 2, trade: 'Builder', is_milestone: false },
        { name: 'Practical completion inspection',    duration_days: 2, trade: 'Builder', is_milestone: true  },
      ],
    },
  ],
}
