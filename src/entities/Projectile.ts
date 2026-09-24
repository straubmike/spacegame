import { COMBAT } from "../game/config";

export class Projectile {
  constructor(
    public x: number,
    public y: number,
    public vx: number,
    public vy: number,
    /** true = pirate shot (hurts player) */
    public readonly hostile: boolean = false,
    /** Hit damage — defaults to COMBAT.projectileDamage. */
    public readonly damage: number = COMBAT.projectileDamage,
  ) {}

  update(dt: number): void {
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

export function spawnProjectile(
  x: number,
  y: number,
  heading: number,
  muzzle: number,
  hostile = false,
  damage: number = COMBAT.projectileDamage,
): Projectile {
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  return new Projectile(
    x + cos * muzzle,
    y + sin * muzzle,
    cos * COMBAT.projectileSpeed,
    sin * COMBAT.projectileSpeed,
    hostile,
    damage,
  );
}
