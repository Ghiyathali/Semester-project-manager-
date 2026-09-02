/**
 * Allocates whole sprints to Unified Process phases.
 *
 * Phases are measured in sprints rather than raw days so that no sprint ever
 * straddles a phase boundary - a sprint belongs to exactly one phase, which is
 * what makes "this sprint is part of Elaboration" a meaningful statement.
 *
 * When the timeline cannot hold four phases of at least one sprint each, phases
 * are merged rather than dropped, and the merged phase inherits the deliverables
 * of everything it absorbed.
 */
import { PHASE_ORDER } from '../types'
import type { PhaseKind, PhaseRatios, PlanWarning, SprintWindow } from '../types'

export interface PhaseGroup {
  kind: PhaseKind
  members: PhaseKind[]
}

export interface PhaseAllocation {
  kind: PhaseKind
  members: PhaseKind[]
  sprintIndices: number[]
  start: string
  end: string
}

export interface AllocateResult {
  allocations: PhaseAllocation[]
  /** sprint index -> phase kind */
  phaseBySprint: Map<number, PhaseKind>
  warnings: PlanWarning[]
}

/** A merged group takes the name of its heaviest member. */
function mergeGroup(members: PhaseKind[], ratios: PhaseRatios): PhaseGroup {
  const kind = members.reduce((best, k) => ((ratios[k] ?? 0) > (ratios[best] ?? 0) ? k : best), members[0])
  return { kind, members }
}

function buildGroups(sprintCount: number, ratios: PhaseRatios): PhaseGroup[] {
  if (sprintCount >= 4) return PHASE_ORDER.map((kind) => ({ kind, members: [kind] }))
  if (sprintCount === 3)
    return [
      mergeGroup(['inception', 'elaboration'], ratios),
      { kind: 'construction', members: ['construction'] },
      { kind: 'transition', members: ['transition'] }
    ]
  if (sprintCount === 2)
    return [
      mergeGroup(['inception', 'elaboration'], ratios),
      mergeGroup(['construction', 'transition'], ratios)
    ]
  return [mergeGroup([...PHASE_ORDER], ratios)]
}

/**
 * Largest-remainder distribution with a floor of one sprint per group: every
 * group gets one sprint up front, then the surplus is shared out by ratio.
 */
function distribute(sprintCount: number, groups: PhaseGroup[], ratios: PhaseRatios): number[] {
  const counts = groups.map(() => 1)
  const surplus = sprintCount - groups.length
  if (surplus <= 0) return counts

  const weights = groups.map((g) => g.members.reduce((sum, m) => sum + (ratios[m] ?? 0), 0))
  const weightSum = weights.reduce((a, b) => a + b, 0) || 1
  const raw = weights.map((w) => (w / weightSum) * surplus)
  const floors = raw.map(Math.floor)
  let left = surplus - floors.reduce((a, b) => a + b, 0)

  const order = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index)

  const extra = [...floors]
  for (let i = 0; left > 0; i = (i + 1) % order.length) {
    extra[order[i].index] += 1
    left -= 1
  }
  return counts.map((c, i) => c + extra[i])
}

export function allocatePhases(sprints: SprintWindow[], ratios: PhaseRatios): AllocateResult {
  const warnings: PlanWarning[] = []
  const phaseBySprint = new Map<number, PhaseKind>()
  if (sprints.length === 0) {
    return { allocations: [], phaseBySprint, warnings }
  }

  const groups = buildGroups(sprints.length, ratios)
  if (groups.length < PHASE_ORDER.length) {
    warnings.push({
      code: 'phases-merged',
      severity: 'warning',
      message: `Only ${sprints.length} sprint${sprints.length === 1 ? '' : 's'} fit in this timeline, so some UP phases were merged.`,
      hint: 'Shorten the sprint length or extend the timeline to get all four phases as distinct stages.'
    })
  }

  const counts = distribute(sprints.length, groups, ratios)
  const allocations: PhaseAllocation[] = []
  let cursor = 0
  groups.forEach((group, i) => {
    const indices: number[] = []
    for (let n = 0; n < counts[i] && cursor < sprints.length; n++, cursor++) {
      indices.push(sprints[cursor].index)
      phaseBySprint.set(sprints[cursor].index, group.kind)
    }
    allocations.push({
      kind: group.kind,
      members: group.members,
      sprintIndices: indices,
      start: sprints[indices[0]].start,
      end: sprints[indices[indices.length - 1]].end
    })
  })

  // Any sprints left over by rounding join the final phase.
  for (; cursor < sprints.length; cursor++) {
    const last = allocations[allocations.length - 1]
    last.sprintIndices.push(sprints[cursor].index)
    last.end = sprints[cursor].end
    phaseBySprint.set(sprints[cursor].index, last.kind)
  }

  return { allocations, phaseBySprint, warnings }
}
