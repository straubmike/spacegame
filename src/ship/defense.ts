/** Shield bank, plating bank, then core. Numbers are current HP. */
export interface DefenseBanks {
  shield: number;
  plating: number;
  core: number;
  /** Seconds since a hit that actually dealt shield, plating, or core damage. */
  timeSinceDamage: number;
  /** Seconds left before a broken shield may start recharging. */
  shieldBreakRemaining: number;
}

/** Which bank actually took the hit. Beams bend only on `"plating"`. */
export type DefenseLayer = "shield" | "plating" | "core" | "none";

/**
 * One hit against shields, then plating, then core.
 *
 * Shields are first. Damage against them is `amount * shieldMultiplier`.
 * A multiplier of 0 (guns) leaves an intact shield untouched and does not
 * spill. If the scaled damage is at least the current shield, the shield
 * breaks, excess is wiped, and recharge waits out `breakDowntime`.
 * That hit does not continue into plating or core.
 *
 * With shields down and plating still up, plating takes
 * `amount * platingMultiplier`. Leftover of that reduced hit spills into
 * core. Kinetic weapons pass 1, so plating takes the full amount.
 *
 * With plating also empty, core takes 100% of `amount`.
 */
export function applyDefenseHit(
  state: DefenseBanks,
  amount: number,
  shieldMultiplier: number,
  platingMultiplier: number,
  breakDowntime: number,
): DefenseLayer {
  if (amount <= 0 || !Number.isFinite(amount)) return "none";

  if (state.shield > 0) {
    const shieldDamage = amount * Math.max(0, shieldMultiplier);
    if (shieldDamage <= 0) return "none";
    state.timeSinceDamage = 0;
    if (shieldDamage >= state.shield) {
      state.shield = 0;
      state.shieldBreakRemaining = breakDowntime;
    } else {
      state.shield -= shieldDamage;
    }
    return "shield";
  }

  state.timeSinceDamage = 0;
  if (state.plating > 0) {
    let remaining = amount * Math.max(0, platingMultiplier);
    const absorbed = Math.min(state.plating, remaining);
    state.plating -= absorbed;
    remaining -= absorbed;
    if (remaining > 0) {
      state.core = Math.max(0, state.core - remaining);
    }
    return "plating";
  }

  state.core = Math.max(0, state.core - amount);
  return "core";
}

/** Kinetic hit. Plating takes the full amount once shields are down. */
export function applyKineticHit(
  state: DefenseBanks,
  amount: number,
  shieldMultiplier: number,
  breakDowntime: number,
): void {
  applyDefenseHit(state, amount, shieldMultiplier, 1, breakDowntime);
}

/**
 * Shield recharge.
 * A broken bank (just hit 0) waits out `shieldBreakRemaining` before any
 * regen starts — downtime is the wait, not an extra quiet period stacked
 * on top. While shields are only chipped, regen still waits `regenDelay`
 * after the last damaging hit.
 */
export function tickShieldRegen(
  state: DefenseBanks,
  dt: number,
  maxShield: number,
  regenDelay: number,
  regenRate: number,
): void {
  state.timeSinceDamage += dt;
  if (state.shieldBreakRemaining > 0) {
    state.shieldBreakRemaining = Math.max(0, state.shieldBreakRemaining - dt);
  }
  if (maxShield <= 0) {
    state.shield = 0;
    state.shieldBreakRemaining = 0;
    return;
  }
  if (state.shield >= maxShield) {
    state.shield = maxShield;
    state.shieldBreakRemaining = 0;
    return;
  }
  if (state.shieldBreakRemaining > 0) return;
  const chargingFromBreak = state.shield <= 0;
  if (!chargingFromBreak && state.timeSinceDamage < regenDelay) return;
  if (regenRate <= 0) return;
  state.shield = Math.min(maxShield, state.shield + regenRate * dt);
}
