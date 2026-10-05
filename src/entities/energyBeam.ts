/** One straight piece of a pulse or beam, in world units. */
export interface BeamSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface BeamHit {
  id: string;
  /** 1 on the first hull, then `falloff` of the previous listed damage. */
  falloff: number;
}

export interface BeamTarget {
  id: string;
  x: number;
  y: number;
  radius: number;
}

/** Signed shortest turn from `from` to `to`, in (-π, π]. */
export function signedAngle(from: number, to: number): number {
  let d = to - from;
  const pi2 = Math.PI * 2;
  while (d > Math.PI) d -= pi2;
  while (d < -Math.PI) d += pi2;
  return d;
}

/**
 * Outgoing heading after a plating deflection. The vertex is the contact
 * on the fired line, not the target center.
 *
 * A straight line through the ship is a 180° path. That happens when the
 * nose points at the attacker (head-on). Every degree the nose is off that
 * heading curls the outgoing path back by the same amount, so 1° off is a
 * 179° path. The bend is to the side the nose turned. Nothing clamps it.
 * A nose pointing directly away is 180° off and the beam reverses along
 * the incoming line.
 */
export function deflectHeading(incoming: number, nose: number): number {
  const headOn = incoming + Math.PI;
  const offset = signedAngle(headOn, nose);
  return incoming - offset;
}

/** First forward intersection of a unit ray with a circle. */
export function rayEntry(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  cx: number,
  cy: number,
  radius: number,
): number | null {
  const lx = ox - cx;
  const ly = oy - cy;
  const b = lx * dx + ly * dy;
  const c = lx * lx + ly * ly - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const s = Math.sqrt(Math.max(0, disc));
  const t1 = -b - s;
  const t2 = -b + s;
  if (t2 < 0) return null;
  return t1 >= 0 ? t1 : 0;
}

/**
 * Walk a pulse or beam out to `range` along the fired heading.
 * The line is not pulled through a target center. An edge overlap still
 * hits, and the incoming piece ends on the fired line at that contact.
 * Pulse passes `stopAtFirst` and never uses the deflect flag.
 * A beam keeps going. `onHit` applies damage and says whether this hull's
 * plating bent the beam. A bend starts at that same contact. Later targets
 * use `falloff` of the previous listed-damage scale. Already-hit hulls
 * are skipped.
 */
export function traceEnergyBeam(args: {
  x: number;
  y: number;
  heading: number;
  range: number;
  halfWidth: number;
  falloff: number;
  targets: readonly BeamTarget[];
  stopAtFirst: boolean;
  onHit: (hit: BeamHit) => { deflect: boolean; nose: number };
}): BeamSegment[] {
  const segments: BeamSegment[] = [];
  const seen = new Set<string>();
  let x = args.x;
  let y = args.y;
  let heading = args.heading;
  let remaining = args.range;
  let falloff = 1;
  // Start of the current straight piece. Stays put across hits that do not bend.
  let segX = x;
  let segY = y;
  const limit = args.targets.length + 1;

  const push = (x2: number, y2: number): void => {
    if (Math.hypot(x2 - segX, y2 - segY) <= 1e-4) return;
    segments.push({ x1: segX, y1: segY, x2, y2 });
  };

  for (let step = 0; step < limit && remaining > 1e-4; step += 1) {
    const dx = Math.cos(heading);
    const dy = Math.sin(heading);
    let best: BeamTarget | null = null;
    let bestT = remaining;
    for (const target of args.targets) {
      if (seen.has(target.id)) continue;
      const reach = target.radius + args.halfWidth;
      const t = rayEntry(x, y, dx, dy, target.x, target.y, reach);
      if (t === null || t > remaining + 1e-6) continue;
      if (t < bestT - 1e-8) {
        best = target;
        bestT = t;
      }
    }
    if (!best) {
      push(x + dx * remaining, y + dy * remaining);
      break;
    }
    // Contact is on the fired line, where the width first meets the hull.
    const hitX = x + dx * bestT;
    const hitY = y + dy * bestT;
    seen.add(best.id);
    const reaction = args.onHit({ id: best.id, falloff });
    remaining -= bestT;
    falloff *= args.falloff;
    const stop = args.stopAtFirst || remaining <= 1e-4;
    if (stop || reaction.deflect) {
      push(hitX, hitY);
      if (stop) break;
      segX = hitX;
      segY = hitY;
    }
    x = hitX;
    y = hitY;
    if (reaction.deflect) heading = deflectHeading(heading, reaction.nose);
  }
  return segments;
}
