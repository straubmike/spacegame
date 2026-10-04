import { TEMP_TARGET, WEAPONS } from "../game/config";
import { applyKineticHit, tickShieldRegen } from "../ship/defense";

/**
 * TEMP(weapons-pass): strip before merge.
 * Immobile target — no AI, no movement, no weapons. Huge shield, plating,
 * and core banks so collision and kinetic rules can be watched.
 */
export class TempTarget {
  readonly id = "temp-target";
  readonly radius = TEMP_TARGET.radius;
  readonly maxShield = TEMP_TARGET.shield;
  readonly maxPlating = TEMP_TARGET.plating;
  readonly maxHealth = TEMP_TARGET.core;
  shield = TEMP_TARGET.shield;
  plating = TEMP_TARGET.plating;
  health = TEMP_TARGET.core;
  shieldBreakRemaining = 0;
  private timeSinceDamage = Number.POSITIVE_INFINITY;

  constructor(
    public x: number,
    public y: number,
  ) {}

  get alive(): boolean {
    return this.health > 0;
  }

  takeKinetic(amount: number, shieldMultiplier: number): void {
    const state = {
      shield: this.shield,
      plating: this.plating,
      core: this.health,
      timeSinceDamage: this.timeSinceDamage,
      shieldBreakRemaining: this.shieldBreakRemaining,
    };
    applyKineticHit(state, amount, shieldMultiplier, WEAPONS.shieldBreakDowntime);
    this.shield = state.shield;
    this.plating = state.plating;
    this.health = state.core;
    this.timeSinceDamage = state.timeSinceDamage;
    this.shieldBreakRemaining = state.shieldBreakRemaining;
  }

  tick(dt: number): void {
    const state = {
      shield: this.shield,
      plating: this.plating,
      core: this.health,
      timeSinceDamage: this.timeSinceDamage,
      shieldBreakRemaining: this.shieldBreakRemaining,
    };
    tickShieldRegen(
      state,
      dt,
      this.maxShield,
      TEMP_TARGET.regenDelay,
      TEMP_TARGET.regenRate,
    );
    this.shield = state.shield;
    this.plating = state.plating;
    this.health = state.core;
    this.timeSinceDamage = state.timeSinceDamage;
    this.shieldBreakRemaining = state.shieldBreakRemaining;
  }
}
