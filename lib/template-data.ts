// Default residential build template — 16 phases, ~98 placeholder tasks.
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
  name: 'Standard Residential Build',
  description: '16-phase residential construction programme for a standard Australian home',
  phases: [
    {
      name: 'Site Establishment',
      color: '#6366f1',
      tasks: [
        { name: 'Site survey and set out', duration_days: 1, trade: 'Surveyor', is_milestone: false },
        { name: 'Temporary fencing and hoarding', duration_days: 1, trade: 'Builder', is_milestone: false },
        { name: 'Temporary power and water connection', duration_days: 1, trade: 'Electrician', is_milestone: false },
        { name: 'Site shed and amenities setup', duration_days: 1, trade: 'Builder', is_milestone: false },
        { name: 'Skip bin and waste management setup', duration_days: 1, trade: 'Builder', is_milestone: false },
      ],
    },
    {
      name: 'Demolition',
      color: '#ef4444',
      tasks: [
        { name: 'Asbestos inspection and clearance', duration_days: 2, trade: 'Builder', is_milestone: false },
        { name: 'Internal demolition', duration_days: 3, trade: 'Builder', is_milestone: false },
        { name: 'External demolition and removal', duration_days: 3, trade: 'Builder', is_milestone: false },
        { name: 'Demolition debris removal', duration_days: 2, trade: 'Builder', is_milestone: false },
      ],
    },
    {
      name: 'Earthworks & Site Prep',
      color: '#f97316',
      tasks: [
        { name: 'Strip topsoil and stockpile', duration_days: 2, trade: 'Builder', is_milestone: false },
        { name: 'Cut and fill earthworks', duration_days: 3, trade: 'Builder', is_milestone: false },
        { name: 'Stormwater drainage rough-in', duration_days: 2, trade: 'Plumber', is_milestone: false },
        { name: 'Termite treatment', duration_days: 1, trade: 'Builder', is_milestone: false },
        { name: 'Engineer inspection — footing design', duration_days: 1, trade: 'Builder', is_milestone: true },
      ],
    },
    {
      name: 'Slab',
      color: '#eab308',
      tasks: [
        { name: 'Set out and excavate footings', duration_days: 2, trade: 'Builder', is_milestone: false },
        { name: 'Pour strip footings', duration_days: 2, trade: 'Builder', is_milestone: false },
        { name: 'Plumbing under-slab rough-in', duration_days: 3, trade: 'Plumber', is_milestone: false },
        { name: 'Electrical conduit under slab', duration_days: 1, trade: 'Electrician', is_milestone: false },
        { name: 'Slab reinforcement and mesh', duration_days: 2, trade: 'Builder', is_milestone: false },
        { name: 'Pour concrete slab', duration_days: 2, trade: 'Builder', is_milestone: true },
      ],
    },
    {
      name: 'Framing',
      color: '#84cc16',
      tasks: [
        { name: 'Ground floor wall framing', duration_days: 3, trade: 'Carpenter', is_milestone: false },
        { name: 'Upper floor joists and flooring', duration_days: 3, trade: 'Carpenter', is_milestone: false },
        { name: 'Upper floor wall framing', duration_days: 3, trade: 'Carpenter', is_milestone: false },
        { name: 'Roof truss delivery and installation', duration_days: 2, trade: 'Carpenter', is_milestone: false },
        { name: 'Roof sarking and battens', duration_days: 2, trade: 'Carpenter', is_milestone: false },
        { name: 'Frame inspection', duration_days: 1, trade: 'Builder', is_milestone: true },
      ],
    },
    {
      name: 'Roof',
      color: '#22c55e',
      tasks: [
        { name: 'Roof tile or metal sheet installation', duration_days: 4, trade: 'Roofer', is_milestone: false },
        { name: 'Ridge capping and pointing', duration_days: 1, trade: 'Roofer', is_milestone: false },
        { name: 'Fascia and gutter installation', duration_days: 2, trade: 'Roofer', is_milestone: false },
        { name: 'Downpipe installation', duration_days: 1, trade: 'Roofer', is_milestone: false },
        { name: 'Roof plumber — flashing and valleys', duration_days: 2, trade: 'Plumber', is_milestone: false },
      ],
    },
    {
      name: 'Windows & External Doors',
      color: '#14b8a6',
      tasks: [
        { name: 'Window and door frame delivery', duration_days: 1, trade: 'Builder', is_milestone: false },
        { name: 'Window installation', duration_days: 3, trade: 'Carpenter', is_milestone: false },
        { name: 'External door installation', duration_days: 2, trade: 'Carpenter', is_milestone: false },
        { name: 'Glazing and weather sealing', duration_days: 1, trade: 'Glazier', is_milestone: false },
      ],
    },
    {
      name: 'Rough-in (Plumbing, Electrical, HVAC)',
      color: '#06b6d4',
      tasks: [
        { name: 'Plumbing rough-in — hot and cold water', duration_days: 3, trade: 'Plumber', is_milestone: false },
        { name: 'Drainage rough-in above slab', duration_days: 2, trade: 'Plumber', is_milestone: false },
        { name: 'Gas rough-in', duration_days: 2, trade: 'Plumber', is_milestone: false },
        { name: 'Electrical rough-in — power, lighting, switchboard', duration_days: 4, trade: 'Electrician', is_milestone: false },
        { name: 'Data and communications rough-in', duration_days: 1, trade: 'Electrician', is_milestone: false },
        { name: 'HVAC ductwork rough-in', duration_days: 2, trade: 'HVAC', is_milestone: false },
        { name: 'Rough-in inspection', duration_days: 1, trade: 'Builder', is_milestone: true },
      ],
    },
    {
      name: 'External Cladding & Brickwork',
      color: '#3b82f6',
      tasks: [
        { name: 'Brickwork or external cladding', duration_days: 8, trade: 'Bricklayer', is_milestone: false },
        { name: 'External render — prep and base coat', duration_days: 3, trade: 'Plasterer', is_milestone: false },
        { name: 'Garage door installation', duration_days: 1, trade: 'Carpenter', is_milestone: false },
        { name: 'External stairs and balustrades', duration_days: 2, trade: 'Carpenter', is_milestone: false },
        { name: 'Scaffold removal', duration_days: 1, trade: 'Builder', is_milestone: false },
      ],
    },
    {
      name: 'Insulation & Internal Lining',
      color: '#8b5cf6',
      tasks: [
        { name: 'Wall and ceiling insulation installation', duration_days: 3, trade: 'Insulation', is_milestone: false },
        { name: 'Plasterboard delivery and stacking', duration_days: 1, trade: 'Builder', is_milestone: false },
        { name: 'Plasterboard hang — walls', duration_days: 3, trade: 'Plasterer', is_milestone: false },
        { name: 'Plasterboard hang — ceilings', duration_days: 2, trade: 'Plasterer', is_milestone: false },
        { name: 'Cornice, set, and flush', duration_days: 3, trade: 'Plasterer', is_milestone: false },
        { name: 'Plasterer final inspection', duration_days: 1, trade: 'Builder', is_milestone: false },
      ],
    },
    {
      name: 'Internal Fit-out (Carpentry)',
      color: '#a855f7',
      tasks: [
        { name: 'Internal door frames and doors', duration_days: 2, trade: 'Carpenter', is_milestone: false },
        { name: 'Skirting and architraves', duration_days: 3, trade: 'Carpenter', is_milestone: false },
        { name: 'Kitchen cabinet installation', duration_days: 3, trade: 'Carpenter', is_milestone: false },
        { name: 'Bathroom vanity and cabinet installation', duration_days: 2, trade: 'Carpenter', is_milestone: false },
        { name: 'Staircase installation', duration_days: 2, trade: 'Carpenter', is_milestone: false },
        { name: 'Wardrobe and built-in installation', duration_days: 3, trade: 'Carpenter', is_milestone: false },
        { name: 'Carpenter final check', duration_days: 1, trade: 'Carpenter', is_milestone: false },
      ],
    },
    {
      name: 'Tiling & Wet Areas',
      color: '#ec4899',
      tasks: [
        { name: 'Waterproofing — bathrooms and laundry', duration_days: 2, trade: 'Tiler', is_milestone: false },
        { name: 'Wall tiling — bathrooms and kitchen splashback', duration_days: 4, trade: 'Tiler', is_milestone: false },
        { name: 'Floor tiling — wet areas', duration_days: 2, trade: 'Tiler', is_milestone: false },
        { name: 'Floor tiling — living areas', duration_days: 3, trade: 'Tiler', is_milestone: false },
        { name: 'Tile grouting and sealing', duration_days: 1, trade: 'Tiler', is_milestone: false },
      ],
    },
    {
      name: 'Painting',
      color: '#f43f5e',
      tasks: [
        { name: 'Primer coat — internal walls and ceilings', duration_days: 2, trade: 'Painter', is_milestone: false },
        { name: 'First coat — internal', duration_days: 2, trade: 'Painter', is_milestone: false },
        { name: 'Second coat and finish — internal', duration_days: 2, trade: 'Painter', is_milestone: false },
        { name: 'External paint or render colour coat', duration_days: 3, trade: 'Painter', is_milestone: false },
        { name: 'Touch-ups and painter inspection', duration_days: 1, trade: 'Painter', is_milestone: false },
      ],
    },
    {
      name: 'Final Fix (Plumbing, Electrical, HVAC)',
      color: '#10b981',
      tasks: [
        { name: 'Plumbing fit-off — taps, toilets, and basins', duration_days: 2, trade: 'Plumber', is_milestone: false },
        { name: 'Hot water system installation', duration_days: 1, trade: 'Plumber', is_milestone: false },
        { name: 'Electrical fit-off — power points and switches', duration_days: 2, trade: 'Electrician', is_milestone: false },
        { name: 'Light fixture installation', duration_days: 2, trade: 'Electrician', is_milestone: false },
        { name: 'HVAC system commissioning', duration_days: 1, trade: 'HVAC', is_milestone: false },
        { name: 'Gas appliance connection and test', duration_days: 1, trade: 'Plumber', is_milestone: false },
        { name: 'Final fix inspection', duration_days: 1, trade: 'Builder', is_milestone: true },
      ],
    },
    {
      name: 'External Works & Landscaping',
      color: '#65a30d',
      tasks: [
        { name: 'Crossover and driveway construction', duration_days: 3, trade: 'Builder', is_milestone: false },
        { name: 'Paths and paving', duration_days: 3, trade: 'Builder', is_milestone: false },
        { name: 'Fencing and gates', duration_days: 3, trade: 'Builder', is_milestone: false },
        { name: 'Topsoil, turf, and landscaping', duration_days: 4, trade: 'Landscaper', is_milestone: false },
        { name: 'Garden beds and planting', duration_days: 2, trade: 'Landscaper', is_milestone: false },
        { name: 'Letterbox and external signage', duration_days: 1, trade: 'Builder', is_milestone: false },
      ],
    },
    {
      name: 'Handover & Defects',
      color: '#0ea5e9',
      tasks: [
        { name: 'Final building inspection — occupancy permit', duration_days: 2, trade: 'Builder', is_milestone: true },
        { name: 'Deep clean', duration_days: 1, trade: 'Builder', is_milestone: false },
        { name: 'Defects inspection and snagging list', duration_days: 2, trade: 'Builder', is_milestone: false },
        { name: 'Defects rectification', duration_days: 2, trade: 'Builder', is_milestone: false },
        { name: 'Client handover and keys', duration_days: 1, trade: 'Builder', is_milestone: true },
      ],
    },
  ],
}
