import { COMBAT } from "../game/config";
import {
  applyDefenseHit,
  tickShieldRegen,
  type DefenseBanks,
  type DefenseLayer,
} from "../ship/defense";
import {
  type PirateArchetypeId,
  type PirateDifficulty,
  type ResolvedNpcFit,
} from "../ship/npcLoadout";
import {
  aimOffset,
  aimSwing,
  missileAimScale,
  type AimSwing,
  type MissileAimScale,
} from "./aimWander";
import { nextCombatId } from "./combatId";
import { fireNpcVolley, tickWeaponCooldowns } from "./npcVolley";
import {
  closingSpeed,
  pickStandoffFamily,
  RANGE_BAND,
  rangeHeading,
  type KineticFamily,
} from "./rangeBand";
import type { Projectile } from "./Projectile";

export type PirateMode = "idle" | "aggro" | "retreat";

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
  /** Pack difficulty. Sets how wide the nose wanders while firing. */
  readonly difficulty: PirateDifficulty;
  /** Shared pack tribute (same value on every wingmate). */
  readonly fee: number;
  private readonly swing: AimSwing;
  private readonly missileScale: MissileAimScale;
  /** Wander phase. Seeded so wingmates do not swing together. */
  private aimTime: number;
  /** Weapon band chosen the first time this ship fights. Not re-rolled. */
  private standoffFamily: KineticFamily | null = null;

  constructor(
    public x: number,
    public y: number,
    public heading: number,
    fit: ResolvedNpcFit,
    difficulty: PirateDifficulty,
    fee = 10,
  ) {
    this.tier = fit.hullId;
    this.fit = fit;
    this.difficulty = difficulty;
    this.fee = fee;
    this.health = this.fit.coreMax;
    this.shield = this.fit.shieldMax;
    this.plating = this.fit.platingMax;
    this.weaponCooldowns = this.fit.weapons.map(() => 0);
    this.swing = aimSwing(difficulty);
    this.missileScale = missileAimScale(difficulty);
    this.aimTime = Math.random() * this.swing.halfPeriod * 2;
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
    platingMultiplier = 1,
  ): DefenseLayer {
    let layer: DefenseLayer = "none";
    if (amount > 0) {
      const state = this.defenseState();
      layer = applyDefenseHit(
        state,
        amount,
        shieldMultiplier,
        platingMultiplier,
        this.fit.shieldBreakDowntime,
      );
      this.writeDefense(state);
    }
    if (this.health <= this.retreatCore && this.health > 0) {
      this.mode = "retreat";
      return layer;
    }
    if (!retaliateAgainstPlayer) return layer;
    if (this.mode !== "retreat") {
      this.mode = "aggro";
    }
    return layer;
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

    // aggro — hold a weapon band. Nose wanders only while facing the target.
    // Retreat and idle stay on a true heading.
    this.aimTime += dt;
    const preferred = RANGE_BAND[this.standoff()];
    const plan = rangeHeading({
      dist,
      toward: towardPlayer,
      preferred,
      closingSpeed: closingSpeed(this.vx, this.vy, dx, dy, dist),
      aimOffset: aimOffset(this.aimTime, this.swing),
    });
    this.turnToward(plan.heading, dt);
    if (plan.thrust) this.thrust(dt);
    else this.applyDrag(dt);
    this.integrate(dt);

    const angleErr = Math.abs(shortestAngle(this.heading, towardPlayer));
    const fireGate = Math.max(COMBAT.pirateFireCone, this.swing.width);
    if (angleErr <= fireGate && dist <= COMBAT.pirateThreatRange) {
      fireNpcVolley({
        fit: this.fit,
        ownerId: this.id,
        x: this.x,
        y: this.y,
        heading: this.heading,
        dist,
        cooldowns: this.weaponCooldowns,
        hostile: true,
        source: "pirate",
        lockId: targetId,
        out: outShots,
        missileTrackScale: this.missileScale.trackScale,
        missileTurnScale: this.missileScale.turnScale,
      });
    }
  }

  /** First aggro picks the band. A one-weapon ship has nothing to vary. */
  private standoff(): KineticFamily {
    if (this.standoffFamily) return this.standoffFamily;
    this.standoffFamily = pickStandoffFamily(
      this.fit.weapons.map((weapon) => weapon.module.family),
    );
    return this.standoffFamily;
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

  private turnToward(desired: number, dt: number): void {
    let delta = shortestAngle(this.heading, desired);
    const maxStep = this.fit.turnRate * dt;
    if (delta > maxStep) delta = maxStep;
    if (delta < -maxStep) delta = -maxStep;
    this.heading += delta;
  }

  private thrust(dt: number): void {
    const accel = this.fit.thrustAccel;
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
    const max = this.fit.maxSpeed;
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
