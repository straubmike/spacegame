import { COMBAT, WEAPONS } from "../game/config";

/** Who fired. Patrol rounds must not be treated as the player's. */
export type ProjectileSource = "player" | "pirate" | "patrol";

/** Kinetic families. `kinetic` is unused by current shooters. */
export type ProjectileFamily = "kinetic" | "gun" | "cannon" | "missile";

export class Projectile {
  heading: number;
  family: ProjectileFamily = "kinetic";
  /** Fraction of `damage` (or a gun chunk) applied to shields. */
  shieldMultiplier: number = WEAPONS.npcShieldMultiplier;
  radius: number = COMBAT.projectileRadius;
  speed: number = COMBAT.projectileSpeed;
  /** Gun stream identity — chunks accrue per slot and target. */
  gunSlotId = "";
  gunChunkDamage = 0;
  gunChunkInterval: number = 1;
  /** Missile steering rate (rad/s) while the lock window remains. */
  turnRate: number = 0;
  trackTimeLeft: number = 0;
  /** Set at launch. Never retargeted. */
  lockId: string | null = null;

  constructor(
    public x: number,
    public y: number,
    public vx: number,
    public vy: number,
    /**
     * true = hurts the player (pirate fire, or a patrol shooting the player).
     * Lawful patrol fire at pirates is false — same color family as player shots.
     */
    public readonly hostile: boolean = false,
    /** Hit damage — defaults to COMBAT.projectileDamage. Gun pellets stay 0. */
    public readonly damage: number = COMBAT.projectileDamage,
    public readonly source: ProjectileSource = "player",
  ) {
    this.heading = Math.atan2(vy, vx);
  }

  update(
    dt: number,
    lockAt?: (id: string) => { x: number; y: number } | null,
  ): void {
    if (this.family === "missile" && this.trackTimeLeft > 0) {
      this.trackTimeLeft -= dt;
      if (this.lockId && lockAt) {
        const target = lockAt(this.lockId);
        if (target) {
          const desired = Math.atan2(target.y - this.y, target.x - this.x);
          let delta = shortestAngle(this.heading, desired);
          const step = this.turnRate * dt;
          if (delta > step) delta = step;
          if (delta < -step) delta = -step;
          this.heading += delta;
          this.vx = Math.cos(this.heading) * this.speed;
          this.vy = Math.sin(this.heading) * this.speed;
        }
      }
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  /** True once far past the camera view (allows off-screen hits). */
  isOffScreen(
    cameraX: number,
    cameraY: number,
    viewW: number,
    viewH: number,
  ): boolean {
    const sx = this.x - cameraX + viewW / 2;
    const sy = this.y - cameraY + viewH / 2;
    const pad = COMBAT.projectileDespawnViewMultiples * Math.max(viewW, viewH);
    return sx < -pad || sy < -pad || sx > viewW + pad || sy > viewH + pad;
  }
}

export interface PlayerShotSpec {
  family: Exclude<ProjectileFamily, "kinetic">;
  speed: number;
  radius: number;
  damage: number;
  shieldMultiplier: number;
  gunSlotId?: string;
  gunChunkDamage?: number;
  gunChunkInterval?: number;
  turnRate?: number;
  trackSeconds?: number;
  lockId?: string | null;
}

/** Pirate or patrol kinetic round. Same families as the player. */
export function spawnNpcShot(
  x: number,
  y: number,
  heading: number,
  muzzle: number,
  source: Exclude<ProjectileSource, "player">,
  hostile: boolean,
  spec: PlayerShotSpec,
): Projectile {
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const shot = new Projectile(
    x + cos * muzzle,
    y + sin * muzzle,
    cos * spec.speed,
    sin * spec.speed,
    hostile,
    spec.damage,
    source,
  );
  shot.family = spec.family;
  shot.heading = heading;
  shot.speed = spec.speed;
  shot.radius = spec.radius;
  shot.shieldMultiplier = spec.shieldMultiplier;
  shot.gunSlotId = spec.gunSlotId ?? "";
  shot.gunChunkDamage = spec.gunChunkDamage ?? 0;
  shot.gunChunkInterval = spec.gunChunkInterval ?? 1;
  shot.turnRate = spec.turnRate ?? 0;
  shot.trackTimeLeft = spec.trackSeconds ?? 0;
  shot.lockId = spec.lockId ?? null;
  return shot;
}

/** Player kinetic round. Guns deal no per-pellet damage. */
export function spawnPlayerShot(
  x: number,
  y: number,
  heading: number,
  muzzle: number,
  spec: PlayerShotSpec,
): Projectile {
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const shot = new Projectile(
    x + cos * muzzle,
    y + sin * muzzle,
    cos * spec.speed,
    sin * spec.speed,
    false,
    spec.damage,
    "player",
  );
  shot.family = spec.family;
  shot.heading = heading;
  shot.speed = spec.speed;
  shot.radius = spec.radius;
  shot.shieldMultiplier = spec.shieldMultiplier;
  shot.gunSlotId = spec.gunSlotId ?? "";
  shot.gunChunkDamage = spec.gunChunkDamage ?? 0;
  shot.gunChunkInterval = spec.gunChunkInterval ?? 1;
  shot.turnRate = spec.turnRate ?? 0;
  shot.trackTimeLeft = spec.trackSeconds ?? 0;
  shot.lockId = spec.lockId ?? null;
  return shot;
}

function shortestAngle(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
