import { COMBAT } from "../game/config";
import { applyKineticHit, tickShieldRegen, type DefenseBanks } from "../ship/defense";
import {
  pirateFit,
  type PirateArchetypeId,
  type ResolvedNpcFit,
} from "../ship/npcLoadout";
import { nextCombatId } from "./combatId";
import { fireNpcVolley, tickWeaponCooldowns } from "./npcVolley";
import type { Projectile } from "./Projectile";

export type PirateMode = "idle" | "aggro" | "retreat";

export interface PirateSpawnOptions {
  /** TEMP(npc-loadouts): strip before merge. Slow, already hostile gallery hull. */
  showcase?: boolean;
}

/** TEMP(npc-loadouts): strip before merge. Showcase hulls close slowly. */
const SHOWCASE_SPEED_SCALE = 0.35;

/**
 * Hostile hull in a local encounter.
 * Fee / hail timing is owned by Game as one pack event — ships only fight
 * when the encounter stance is hostile (or after being attacked).
 * Weapons, shields, plating, and core come from the same modules as the player.
 */
export class Pirate {
  readonly id = nextCombatId("pirate");
  /** Core hull. Shields and plating are separate banks. */
  health: number;
  shield: number;
  plating: number;
  shieldBreakRemaining = 0;
  private timeSinceDamage = Number.POSITIVE_INFINITY;
  vx = 0;
  vy = 0;
  mode: PirateMode = "idle";
  private readonly weaponCooldowns: number[];
  /** Set when retreat finishes — Game removes on warp. */
  warpedAway = false;

  readonly tier: PirateArchetypeId;
  readonly fit: ResolvedNpcFit;
  /** Shared pack tribute (same value on every wingmate). */
  readonly fee: number;
  /** TEMP(npc-loadouts): strip before merge. */
  readonly showcase: boolean;

  constructor(
    public x: number,
    public y: number,
    public heading: number,
    tier: PirateArchetypeId = "raider",
    fee = 10,
    options?: PirateSpawnOptions,
  ) {
    this.tier = tier;
    this.fit = pirateFit(tier);
    this.fee = fee;
    this.showcase = options?.showcase === true;
    this.health = this.fit.coreMax;
    this.shield = this.fit.shieldMax;
    this.plating = this.fit.platingMax;
    this.weaponCooldowns = this.fit.weapons.map(() => 0);
  }

  get alive(): boolean {
    return this.health > 0 && !this.warpedAway;
  }

  get maxHealth(): number {
    return this.fit.coreMax;
  }

  get maxShield(): number {
    return this.fit.shieldMax;
  }

  get maxPlating(): number {
    return this.fit.platingMax;
  }

  get size(): number {
    return this.fit.size;
  }

  get radius(): number {
    return this.fit.radius;
  }

  get hullId(): PirateArchetypeId {
    return this.fit.hullId;
  }

  get hullName(): string {
    return this.fit.hullName;
  }

  get fill(): string {
    return this.fit.fill;
  }

  get stroke(): string {
    return this.fit.stroke;
  }

  /** Core HP at or below this starts a retreat. About 20% of the hull. */
  private get retreatCore(): number {
    return Math.max(1, Math.floor(this.fit.coreMax * 0.2));
  }

  /**
   * @param retaliateAgainstPlayer false when a patrol (not the player) landed
   * the hit — don't turn a law-enforcement shot into a grudge against the player.
   * A zero-damage gun pellet still counts as contact. Near-death still flees.
   */
  takeDamage(
    amount: number,
    shieldMultiplier: number,
    retaliateAgainstPlayer = true,
  ): void {
    if (amount > 0) {
      const state = this.defenseState();
      applyKineticHit(
        state,
        amount,
        shieldMultiplier,
        this.fit.shieldBreakDowntime,
      );
      this.writeDefense(state);
    }
    if (this.health <= this.retreatCore && this.health > 0) {
      this.mode = "retreat";
      return;
    }
    if (!retaliateAgainstPlayer) return;
    if (this.mode !== "retreat") {
      this.mode = "aggro";
    }
  }

  /** Stand down after pack tribute (or while the fee window is open). */
  setPeaceful(): void {
    if (this.mode === "retreat") return;
    this.mode = "idle";
  }

  goAggro(): void {
    if (!this.alive || this.mode === "retreat") return;
    this.mode = "aggro";
  }

  /**
   * Movement + combat. `hostile` is the pack encounter stance from Game.
   * `targetId` is locked onto missiles at the moment of fire.
   */
  update(
    dt: number,
    playerX: number,
    playerY: number,
    outShots: Projectile[],
    hostile: boolean,
    targetId: string,
  ): void {
    if (!this.alive) return;

    this.tickDefense(dt);
    tickWeaponCooldowns(this.weaponCooldowns, dt);

    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.hypot(dx, dy);
    const towardPlayer = Math.atan2(dy, dx);

    if (this.health <= this.retreatCore) {
      this.mode = "retreat";
    } else if (this.mode === "retreat") {
      // stay fleeing
    } else if (hostile || this.mode === "aggro") {
      this.mode = "aggro";
    } else {
      this.mode = "idle";
    }

    if (this.mode === "idle") {
      this.applyDrag(dt);
      this.integrate(dt);
      return;
    }

    if (this.mode === "retreat") {
      const away = towardPlayer + Math.PI;
      this.turnToward(away, dt);
      this.thrust(dt);
      this.integrate(dt);
      if (dist >= COMBAT.pirateRetreatRange) {
        this.warpedAway = true;
      }
      return;
    }

    // aggro
    this.turnToward(towardPlayer, dt);

    if (dist > COMBAT.pirateEngageRange) {
      this.thrust(dt);
    } else {
      this.applyDrag(dt);
    }

    this.integrate(dt);

    const angleErr = Math.abs(shortestAngle(this.heading, towardPlayer));
    if (angleErr <= COMBAT.pirateFireCone && dist <= COMBAT.pirateThreatRange) {
      fireNpcVolley({
        fit: this.fit,
        ownerId: this.id,
        x: this.x,
        y: this.y,
        heading: this.heading,
        cooldowns: this.weaponCooldowns,
        hostile: true,
        source: "pirate",
        lockId: targetId,
        out: outShots,
      });
    }
  }

  private defenseState(): DefenseBanks {
    return {
      shield: this.shield,
      plating: this.plating,
      core: this.health,
      timeSinceDamage: this.timeSinceDamage,
      shieldBreakRemaining: this.shieldBreakRemaining,
    };
  }

  private writeDefense(state: DefenseBanks): void {
    this.shield = state.shield;
    this.plating = state.plating;
    this.health = state.core;
    this.timeSinceDamage = state.timeSinceDamage;
    this.shieldBreakRemaining = state.shieldBreakRemaining;
  }

  private tickDefense(dt: number): void {
    const state = this.defenseState();
    tickShieldRegen(
      state,
      dt,
      this.fit.shieldMax,
      this.fit.shieldRegenDelay,
      this.fit.shieldRegenRate,
    );
    this.writeDefense(state);
  }

  private speedScale(): number {
    return this.showcase ? SHOWCASE_SPEED_SCALE : 1;
  }

  private turnToward(desired: number, dt: number): void {
    let delta = shortestAngle(this.heading, desired);
    const maxStep = this.fit.turnRate * dt;
    if (delta > maxStep) delta = maxStep;
    if (delta < -maxStep) delta = -maxStep;
    this.heading += delta;
  }

  private thrust(dt: number): void {
    const accel = this.fit.thrustAccel * this.speedScale();
    this.vx += Math.cos(this.heading) * accel * dt;
    this.vy += Math.sin(this.heading) * accel * dt;
    this.clampSpeed();
  }

  private applyDrag(dt: number): void {
    const dragFactor = Math.pow(this.fit.drag, dt * 60);
    this.vx *= dragFactor;
    this.vy *= dragFactor;
  }

  private clampSpeed(): void {
    const max = this.fit.maxSpeed * this.speedScale();
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > max) {
      const s = max / speed;
      this.vx *= s;
      this.vy *= s;
    }
  }

  private integrate(dt: number): void {
    this.clampSpeed();
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
}

function shortestAngle(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
