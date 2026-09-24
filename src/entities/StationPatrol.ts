import { COMBAT, PATROL, SHIP } from "../game/config";
import { spawnProjectile, type Projectile } from "./Projectile";
import type { Pirate } from "./Pirate";

type PatrolStance = "idle" | "wander" | "huntPirate" | "warn" | "aggroPlayer";

/** How the patrol treats the player, from host-station standing. */
export type PatrolPlayerLaw = "ignore" | "warn" | "aggro";

export type PatrolUpdateResult = {
  /** True the frame a Violation warning window opens. */
  justWarned: boolean;
  /** True the frame warning expires into combat. */
  justAggroed: boolean;
};

/**
 * Station-affiliated patrol hull.
 * Idle + random wander; hunts pirates; player law: ignore / warn / aggro.
 * Player fire marks defending → return fire (hostile shots).
 */
export class StationPatrol {
  health: number;
  vx = 0;
  vy = 0;
  heading: number;
  fireCooldown = 0;

  /** Set when the player shoots this hull — forces return fire. */
  defending = false;
  /** Violation warning countdown (seconds); 0 = inactive. */
  warningTimer = 0;
  private warningArmed = false;

  private stance: PatrolStance = "idle";
  private stanceTimer: number;
  private wanderTarget: { x: number; y: number } | null = null;

  constructor(
    public x: number,
    public y: number,
    heading: number,
    public readonly stationId: number,
    public readonly stationName: string,
    public readonly stationKey: string,
    public readonly homeX: number,
    public readonly homeY: number,
  ) {
    this.heading = heading;
    this.health = PATROL.maxHealth;
    this.stanceTimer =
      PATROL.idleHoldMin +
      Math.random() * (PATROL.idleHoldMax - PATROL.idleHoldMin);
  }

  get alive(): boolean {
    return this.health > 0;
  }

  get size(): number {
    return PATROL.size;
  }

  get radius(): number {
    return PATROL.radius;
  }

  get maxHealth(): number {
    return PATROL.maxHealth;
  }

  takeDamage(amount: number): void {
    this.health = Math.max(0, this.health - amount);
  }

  /** Player attacked this ship — return fire regardless of standing. */
  markDefending(): void {
    this.defending = true;
    this.warningTimer = 0;
    this.warningArmed = false;
    this.stance = "aggroPlayer";
    this.wanderTarget = null;
  }

  /** Standing improved / fine paid — stop Violation countdown. */
  clearWarning(): void {
    this.warningTimer = 0;
    this.warningArmed = false;
    if (this.stance === "warn" && !this.defending) {
      this.enterIdle();
    }
  }

  /**
   * @param law ignore | warn (Violation) | aggro (Hostile)
   * Returns warn/aggro edge events for Game messaging / UI.
   */
  update(
    dt: number,
    pirates: readonly Pirate[],
    playerX: number,
    playerY: number,
    outShots: Projectile[],
    law: PatrolPlayerLaw,
  ): PatrolUpdateResult {
    const result: PatrolUpdateResult = { justWarned: false, justAggroed: false };
    if (!this.alive) return result;
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);

    const distPlayer = Math.hypot(playerX - this.x, playerY - this.y);
    const playerInRange = distPlayer <= PATROL.huntRange;

    // Defending or Hostile standing → fight the player.
    if (this.defending || law === "aggro") {
      if (this.stance !== "aggroPlayer") {
        this.stance = "aggroPlayer";
        this.wanderTarget = null;
      }
      this.chaseAndFire(dt, playerX, playerY, outShots, true);
      return result;
    }

    // Violation: warning window then aggro.
    if (law === "warn") {
      if (playerInRange) {
        if (!this.warningArmed) {
          this.warningArmed = true;
          this.warningTimer = PATROL.warningSeconds;
          this.stance = "warn";
          this.wanderTarget = null;
          result.justWarned = true;
        }
        if (this.warningTimer > 0) {
          this.warningTimer = Math.max(0, this.warningTimer - dt);
          if (this.warningTimer <= 0) {
            this.stance = "aggroPlayer";
            result.justAggroed = true;
            this.chaseAndFire(dt, playerX, playerY, outShots, true);
            return result;
          }
          // During warning: still hunt pirates; soft-face the player.
          const pirate = this.nearestPirate(pirates);
          if (pirate) {
            this.chaseAndFire(dt, pirate.x, pirate.y, outShots, false);
          } else {
            this.turnToward(Math.atan2(playerY - this.y, playerX - this.x), dt);
            this.applyDrag(dt);
            this.integrate(dt);
          }
          return result;
        }
      } else if (this.warningArmed && this.warningTimer > 0) {
        // Left range during window — pause countdown but keep armed.
        const pirate = this.nearestPirate(pirates);
        if (pirate) {
          this.chaseAndFire(dt, pirate.x, pirate.y, outShots, false);
        } else {
          this.idleOrWander(dt);
        }
        return result;
      }
    } else {
      // Standing improved — clear warning state.
      this.warningArmed = false;
      this.warningTimer = 0;
    }

    // Ignore / Unfriendly: hunt pirates, idle, wander.
    const pirate = this.nearestPirate(pirates);
    if (pirate) {
      this.stance = "huntPirate";
      this.wanderTarget = null;
      this.chaseAndFire(dt, pirate.x, pirate.y, outShots, false);
      return result;
    }

    if (this.stance === "huntPirate" || this.stance === "warn") {
      this.enterIdle();
    }

    this.idleOrWander(dt);
    return result;
  }

  private idleOrWander(dt: number): void {
    if (this.stance === "wander" && this.wanderTarget) {
      this.cruiseToward(dt, this.wanderTarget);
      return;
    }
    this.stanceTimer = Math.max(0, this.stanceTimer - dt);
    if (this.stanceTimer <= 0) {
      this.enterWander();
      if (this.wanderTarget) {
        this.cruiseToward(dt, this.wanderTarget);
        return;
      }
    }
    this.applyDrag(dt);
    this.integrate(dt);
  }

  private enterIdle(): void {
    this.stance = "idle";
    this.wanderTarget = null;
    this.stanceTimer =
      PATROL.idleHoldMin +
      Math.random() * (PATROL.idleHoldMax - PATROL.idleHoldMin);
    this.vx = 0;
    this.vy = 0;
  }

  private enterWander(): void {
    this.stance = "wander";
    this.wanderTarget = this.pickWanderPoint();
  }

  private pickWanderPoint(): { x: number; y: number } {
    const near = Math.random() < PATROL.wanderNearChance;
    const min = near ? PATROL.wanderNearMin : PATROL.wanderFarMin;
    const max = near ? PATROL.wanderNearMax : PATROL.wanderFarMax;
    const dist = min + Math.random() * (max - min);
    const angle = Math.random() * Math.PI * 2;
    return {
      x: this.homeX + Math.cos(angle) * dist,
      y: this.homeY + Math.sin(angle) * dist,
    };
  }

  private nearestPirate(pirates: readonly Pirate[]): Pirate | null {
    let best: Pirate | null = null;
    let bestDist: number = PATROL.huntRange;
    for (const p of pirates) {
      if (!p.alive) continue;
      const d = Math.hypot(p.x - this.x, p.y - this.y);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  }

  /**
   * @param hostileShot true = hurts player; false = hurts pirates (lawful fire).
   */
  private chaseAndFire(
    dt: number,
    tx: number,
    ty: number,
    outShots: Projectile[],
    hostileShot: boolean,
  ): void {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    const toward = Math.atan2(dy, dx);
    this.turnToward(toward, dt);

    if (dist > PATROL.engageRange) {
      this.thrust(dt);
    } else {
      this.applyDrag(dt);
    }
    this.integrate(dt);

    const angleErr = Math.abs(shortestAngle(this.heading, toward));
    if (
      this.fireCooldown <= 0 &&
      angleErr <= COMBAT.pirateFireCone &&
      dist <= PATROL.huntRange
    ) {
      outShots.push(
        spawnProjectile(
          this.x,
          this.y,
          this.heading,
          PATROL.size,
          hostileShot,
          PATROL.damage,
        ),
      );
      this.fireCooldown = PATROL.fireCooldown;
    }
  }

  private cruiseToward(dt: number, wp: { x: number; y: number }): void {
    const dx = wp.x - this.x;
    const dy = wp.y - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= PATROL.waypointArrive) {
      this.enterIdle();
      this.applyDrag(dt);
      this.integrate(dt);
      return;
    }

    const desired = Math.atan2(dy, dx);
    this.turnToward(desired, dt);

    const angleErr = Math.abs(shortestAngle(this.heading, desired));
    if (angleErr < 0.45) {
      const speed = PATROL.wanderSpeed;
      this.vx = Math.cos(this.heading) * speed;
      this.vy = Math.sin(this.heading) * speed;
    } else {
      this.applyDrag(dt);
    }
    this.integrate(dt);
  }

  private turnToward(desired: number, dt: number): void {
    let delta = shortestAngle(this.heading, desired);
    const maxStep = COMBAT.pirateTurnRate * PATROL.turnRateMul * dt;
    if (delta > maxStep) delta = maxStep;
    if (delta < -maxStep) delta = -maxStep;
    this.heading += delta;
  }

  private thrust(dt: number): void {
    const accel = SHIP.thrustAccel * PATROL.speedFactor;
    this.vx += Math.cos(this.heading) * accel * dt;
    this.vy += Math.sin(this.heading) * accel * dt;
    this.clampSpeed();
  }

  private applyDrag(dt: number): void {
    const dragFactor = Math.pow(SHIP.drag, dt * 60);
    this.vx *= dragFactor;
    this.vy *= dragFactor;
  }

  private clampSpeed(): void {
    const max = SHIP.maxSpeed * PATROL.speedFactor;
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
