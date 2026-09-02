/**
 * Minute-range set algebra, used to combine the weekly availability pattern
 * with one-off blackouts and extra sessions. Ranges are `[start, end)` in
 * minutes from midnight.
 */

export interface Range {
  start: number
  end: number
}

export function normalize(ranges: Range[]): Range[] {
  const valid = ranges.filter((r) => r.end > r.start).sort((a, b) => a.start - b.start)
  const out: Range[] = []
  for (const r of valid) {
    const last = out[out.length - 1]
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end)
    } else {
      out.push({ ...r })
    }
  }
  return out
}

export function union(a: Range[], b: Range[]): Range[] {
  return normalize([...a, ...b])
}

/** Everything in `base` that is not covered by `cut`. */
export function subtract(base: Range[], cut: Range[]): Range[] {
  const cuts = normalize(cut)
  let current = normalize(base)
  for (const c of cuts) {
    const next: Range[] = []
    for (const r of current) {
      if (c.end <= r.start || c.start >= r.end) {
        next.push(r)
        continue
      }
      if (c.start > r.start) next.push({ start: r.start, end: c.start })
      if (c.end < r.end) next.push({ start: c.end, end: r.end })
    }
    current = next
  }
  return normalize(current)
}

export function intersect(a: Range[], b: Range[]): Range[] {
  const out: Range[] = []
  for (const x of normalize(a)) {
    for (const y of normalize(b)) {
      const start = Math.max(x.start, y.start)
      const end = Math.min(x.end, y.end)
      if (end > start) out.push({ start, end })
    }
  }
  return normalize(out)
}

export function totalMinutes(ranges: Range[]): number {
  return ranges.reduce((sum, r) => sum + (r.end - r.start), 0)
}
