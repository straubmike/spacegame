import { COMBAT, PATROL, SHIP } from "../game/config";
import { spawnProjectile, type Projectile } from "./Projectile";
import type { Pirate } from "./Pirate";

type PatrolStance = "idle" | "circuit" | "hunt";

/**
 * Station-affiliated patrol hull.
 * Primary stance mirrors pirate idle (stable, clickable). Between hunts it
 * occasionally cruises a calm rectangle around the host station — never spins
 * chasing a moving orbit point. Player fines are handled by Game via click.
 */
export class StationPatrol {
  health: number;
  vx = 0;
  vy = 0;
  heading: number;
  fireCooldown = 0;

  private stance: PatrolStance = "idle";
  /** Countdown until switching idle ↔ circuit (when no pirates). */
  private stanceTimer: number;
  /** Index into the four circuit corners (N→E→S→W). */
  private waypointIndex: number;
  private readonly corners: { x: number; y: number }[];

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
    const r = PATROL.circuitRadius;
    // Rectangle circuit — lines, not a tight spin.
    this.corners = [
      { x: homeX, y: homeY - r },
      { x: homeX + r, y: homeY },
      { x: homeX, y: homeY + r },
      { x: homeX - r, y: homeY },
    ];
    this.waypointIndex = nearestCornerIndex(x, y, this.corners);
    // Stagger so not every patrol starts a circuit on the same frame.
    this.stanceTimer = PATROL.idleHoldMin + Math.random() * (PATROL.idleHoldMax - PATROL.idleHoldMin);
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
   * Hunt nearest pirate when in range; otherwise idle (stable) or calm circuit.
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
      this.stance = "hunt";
      this.chaseAndFire(dt, target.x, target.y, outShots);
      return;
    }

    // Leaving hunt: settle into idle so the ship is easy to click again.
    if (this.stance === "hunt") {
      this.enterIdle();
    }

    this.stanceTimer = Math.max(0, this.stanceTimer - dt);
    if (this.stanceTimer <= 0) {
      if (this.stance === "idle") {
        this.enterCircuit();
      } else {
        this.enterIdle();
      }
    }

    if (this.stance === "circuit") {
      this.cruiseCircuit(dt);
    } else {
      // Pirate-like idle: kill velocity, hold heading — stable click target.
      this.applyDrag(dt);
      this.integrate(dt);
    }
  }

  private enterIdle(): void {
    this.stance = "idle";
    this.stanceTimer =
      PATROL.idleHoldMin +
      Math.random() * (PATROL.idleHoldMax - PATROL.idleHoldMin);
    this.vx = 0;
    this.vy = 0;
  }

  private enterCircuit(): void {
    this.stance = "circuit";
    this.stanceTimer =
      PATROL.circuitHoldMin +
      Math.random() * (PATROL.circuitHoldMax - PATROL.circuitHoldMin);
    this.waypointIndex = nearestCornerIndex(this.x, this.y, this.corners);
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

  /**
   * Slow straight-line legs between circuit corners (no orbit-chase spin).
   */
  private cruiseCircuit(dt: number): void {
    const wp = this.corners[this.waypointIndex]!;
    const dx = wp.x - this.x;
    const dy = wp.y - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= PATROL.waypointArrive) {
      this.waypointIndex = (this.waypointIndex + 1) % this.corners.length;
      this.applyDrag(dt);
      this.integrate(dt);
      return;
    }

    const desired = Math.atan2(dy, dx);
    this.turnToward(desired, dt);

    // Soft cruise: set velocity along heading at circuitSpeed (not full thrust).
    const speed = PATROL.circuitSpeed;
    const angleErr = Math.abs(shortestAngle(this.heading, desired));
    if (angleErr < 0.45) {
      this.vx = Math.cos(this.heading) * speed;
      this.vy = Math.sin(this.heading) * speed;
    } else {
      // Wait until roughly pointed at the next corner — prevents pirouettes.
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

function nearestCornerIndex(
  x: number,
  y: number,
  corners: readonly { x: number; y: number }[],
): number {
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < corners.length; i += 1) {
    const c = corners[i]!;
    const d = Math.hypot(c.x - x, c.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function shortestAngle(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
