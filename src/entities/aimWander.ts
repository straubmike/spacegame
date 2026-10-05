/**
 * Hidden combat accuracy. The nose eases from one side of the true aim to
 * the other. Width is the accuracy; a longer half-period is how a better
 * shot holds before it walks off. Per-frame noise would still average onto
 * the target, and a fixed bias can be parked inside.
 *
 * Difficulty 1 is ±22° in 0.50s (a gun stream's on-target window is a
 * fraction of a chunk, and the gap exceeds the 0.25s reset). Difficulty 7
 * is ±8° in 1.00s (a chunk can finish on a clean cross and still is not
 * guaranteed, because the nose leaves and the gap resets the stream).
 */

const DEG = Math.PI / 180;

/** Patrols are not on the pirate ladder. Competent, and still able to walk off. */
export const PATROL_AIM_DIFFICULTY = 4.5;

const WIDTH_LOW = 22 * DEG;
const WIDTH_HIGH = 8 * DEG;
const HALF_PERIOD_LOW = 0.5;
const HALF_PERIOD_HIGH = 1;

export type AimSwing = {
  /** Half-amplitude, radians, each side of the true aim. */
  width: number;
  /** Seconds to ease from one extreme to the other. */
  halfPeriod: number;
};

/** 0 at difficulty 1, 1 at difficulty 7. */
export function aimAccuracy(difficulty: number): number {
  const t = (difficulty - 1) / 6;
  if (t < 0) return 0;
  if (t > 1) return 1;
  return t;
}

export function aimSwing(difficulty: number): AimSwing {
  const t = aimAccuracy(difficulty);
  return {
    width: WIDTH_LOW + (WIDTH_HIGH - WIDTH_LOW) * t,
    halfPeriod: HALF_PERIOD_LOW + (HALF_PERIOD_HIGH - HALF_PERIOD_LOW) * t,
  };
}

/** Smooth offset around true aim. `time` is seconds and carries the per-ship phase. */
export function aimOffset(time: number, swing: AimSwing): number {
  const period = swing.halfPeriod * 2;
  return swing.width * Math.sin((Math.PI * 2 * time) / period);
}

export type MissileAimScale = {
  /** Fraction of the module lock time. */
  trackScale: number;
  /** Fraction of the module turn rate. */
  turnScale: number;
};

/**
 * Low accuracy shortens both lock time and turn rate so a wide launch cannot
 * be flown back onto the target. Difficulty 7 keeps the module's full homing.
 */
export function missileAimScale(difficulty: number): MissileAimScale {
  const acc = aimAccuracy(difficulty);
  const shaped = acc * acc;
  return {
    trackScale: 0.25 + 0.75 * shaped,
    turnScale: 0.2 + 0.8 * shaped,
  };
}
