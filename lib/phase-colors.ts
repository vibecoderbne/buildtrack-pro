export const PHASE_COLORS = [
  '#2563eb', // Phase 1
  '#dc2626', // Phase 2
  '#d97706', // Phase 3
  '#ca8a04', // Phase 4
  '#0891b2', // Phase 5
  '#7c3aed', // Phase 6
  '#16a34a', // Phase 7
] as const

export function getPhaseColor(index: number): string {
  return PHASE_COLORS[index % PHASE_COLORS.length]
}
