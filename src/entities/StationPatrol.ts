import { COMBAT, PATROL, SHIP } from "../game/config";
import { spawnProjectile, type Projectile } from "./Projectile";
import type { Pirate } from "./Pirate";

/**
 * Station-affiliated patrol hull. Loiters near its host station and hunts
 * local pirates. Player fines are handled by Game via click (not combat).
 */
export class StationPatrol {
  health: number;
  vx = 0;
  vy = 0;
  heading: number;
  fireCooldown = 0;
  /** Radians for idle orbit around the home station. */
  private orbitAngle: number;

  constructor(
    public x: number,
    public y: number,
    heading: number,
    /** Host station landmark id (local view). */
    public readonly stationId: number,
    public readonly stationName: string,
    /** Stable station key for reputation / fines. */
    public readonly stationKey: string,
    public readonly homeX: number,
    public readonly homeY: number,
  ) {
    this.heading = heading;
    this.health = PATROL.maxHealth;
    this.orbitAngle = Math.atan2(y - homeY, x - homeX);
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

  /**
   * Hunt nearest pirate or loiter at the host station.
   * Shots are non-hostile (hurt pirates like player fire; never the player).
   */
  update(
    dt: number,
    pirates: readonly Pirate[],
    outShots: Projectile[],
  ): void {
    if (!this.alive) return;
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);

    const target = this.nearestPirate(pirates);
    if (target) {
      this.chaseAndFire(dt, target.x, target.y, outShots);
      return;
    }
    this.loiter(dt);
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

  private chaseAndFire(
    dt: number,
    tx: number,
    ty: number,
    outShots: Projectile[],
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
          false,
          PATROL.damage,
        ),
      );
      this.fireCooldown = PATROL.fireCooldown;
    }
  }

  private loiter(dt: number): void {
    this.orbitAngle += 0.35 * dt;
    const destX = this.homeX + Math.cos(this.orbitAngle) * PATROL.loiterRadius;
    const destY = this.homeY + Math.sin(this.orbitAngle) * PATROL.loiterRadius;
    const dx = destX - this.x;
    const dy = destY - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 8) {
      this.turnToward(Math.atan2(dy, dx), dt);
      this.thrust(dt * 0.7);
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
