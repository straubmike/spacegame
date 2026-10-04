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

/**
 * Kinetic hit against the three defense banks.
 *
 * Shields are first. Damage against them is `amount * shieldMultiplier`.
 * A multiplier of 0 (guns) leaves an intact shield untouched and does not
 * spill. If the scaled damage is at least the current shield, the shield
 * breaks, excess is wiped, and recharge waits out `breakDowntime`
 * (the equipped shield module's stat). That hit does not continue into
 * plating or core.
 *
 * Once the shield bank is empty, the full amount hits plating (kinetic is
 * unreduced there) and any leftover spills into core.
 */
export function applyKineticHit(
  state: DefenseBanks,
  amount: number,
  shieldMultiplier: number,
  breakDowntime: number,
): void {
  if (amount <= 0 || !Number.isFinite(amount)) return;

  if (state.shield > 0) {
    const shieldDamage = amount * Math.max(0, shieldMultiplier);
    if (shieldDamage <= 0) return;
    state.timeSinceDamage = 0;
    if (shieldDamage >= state.shield) {
      state.shield = 0;
      state.shieldBreakRemaining = breakDowntime;
      return;
    }
    state.shield -= shieldDamage;
    return;
  }

  state.timeSinceDamage = 0;
  let remaining = amount;
  if (state.plating > 0) {
    const absorbed = Math.min(state.plating, remaining);
    state.plating -= absorbed;
    remaining -= absorbed;
  }
  if (remaining > 0) {
    state.core = Math.max(0, state.core - remaining);
  }
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
