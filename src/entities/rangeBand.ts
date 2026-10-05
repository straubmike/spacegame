import type { WeaponFamily } from "../ship/equipment";

/**
 * Combat standoff. Near stays well outside hull contact (~30) so aim wander
 * and a dodge still decide hits. Bands sit inside the existing fight
 * envelope: pirate shots out to 480, patrol shots out to 720, missile
 * homing covers about 450.
 *
 * Cannon 160, gun 280, missile 420. Bracket edges are the midpoints
 * (220 and 350), so a ship sitting on its hold is in that weapon's bracket.
 */
export const RANGE_BAND = {
  cannon: 160,
  gun: 280,
  missile: 420,
} as const;

const CANNON_GUN_EDGE = (RANGE_BAND.cannon + RANGE_BAND.gun) / 2;
const GUN_MISSILE_EDGE = (RANGE_BAND.gun + RANGE_BAND.missile) / 2;

/**
 * Off-bracket weapons fire on one ready cycle in four.
 * A gun's real cooldown is a pellet stream, so an off-bracket gun rolls
 * once a second instead. That gap is longer than the stream reset.
 */
export const OFF_BRACKET_FIRE_CHANCE = 0.25;
export const OFF_BRACKET_GUN_INTERVAL = 1;

export function rangeBracket(dist: number): WeaponFamily {
  if (dist < CANNON_GUN_EDGE) return "cannon";
  if (dist < GUN_MISSILE_EDGE) return "gun";
  return "missile";
}

/** One band per fight. A single family is fixed. Several families roll once. */
export function pickStandoffFamily(families: readonly WeaponFamily[]): WeaponFamily {
  const unique: WeaponFamily[] = [];
  for (const family of families) {
    if (!unique.includes(family)) unique.push(family);
  }
  if (unique.length === 0) return "gun";
  const index = Math.floor(Math.random() * unique.length) % unique.length;
  return unique[index]!;
}

/**
 * Nose stays on the wandered aim while the ship eases onto the band.
 * Closing speed is capped. The ship burns outward when it is inside the
 * band or still coming in hard.
 */
export function rangeHeading(args: {
  dist: number;
  toward: number;
  preferred: number;
  closingSpeed: number;
  aimOffset: number;
}): { heading: number; thrust: boolean } {
  const window = 8;
  const outer = args.preferred + window;
  const inner = args.preferred - window;
  const face = args.toward + args.aimOffset;
  const away = args.toward + Math.PI;
  if (args.dist > outer) {
    const desired = Math.min(70, (args.dist - outer) * 0.45);
    if (args.closingSpeed < desired - 3) return { heading: face, thrust: true };
    return { heading: face, thrust: false };
  }
  if (args.dist < inner) {
    const desiredOut = Math.min(70, (inner - args.dist) * 0.45);
    if (-args.closingSpeed < desiredOut - 3) return { heading: away, thrust: true };
    return { heading: face, thrust: false };
  }
  if (args.closingSpeed > 55) return { heading: away, thrust: true };
  return { heading: face, thrust: false };
}

/** Positive when velocity points at the target. */
export function closingSpeed(
  vx: number,
  vy: number,
  dx: number,
  dy: number,
  dist: number,
): number {
  if (dist < 1e-3) return 0;
  return (vx * dx + vy * dy) / dist;
}
