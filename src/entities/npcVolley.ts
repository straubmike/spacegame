import { WEAPONS } from "../game/config";
import type { ResolvedNpcFit } from "../ship/npcLoadout";
import { spawnNpcShot, type Projectile, type ProjectileSource } from "./Projectile";

/** Missile lock id for the player. Not added to lockable targets. */
export const PLAYER_LOCK_ID = "player";

/**
 * Fire every ready weapon, the way a player holding every trigger would.
 * Each round uses that module's family, damage, shield multiplier, spread,
 * tracking, and time-on-target. Magazines are not consumed.
 */
export function fireNpcVolley(args: {
  fit: ResolvedNpcFit;
  ownerId: string;
  x: number;
  y: number;
  heading: number;
  cooldowns: number[];
  hostile: boolean;
  source: Exclude<ProjectileSource, "player">;
  lockId: string;
  out: Projectile[];
}): void {
  const muzzle = args.fit.size;
  for (let i = 0; i < args.fit.weapons.length; i += 1) {
    if ((args.cooldowns[i] ?? 0) > 0) continue;
    const weapon = args.fit.weapons[i]!.module;
    if (weapon.family === "gun") {
      const offset = (Math.random() * 2 - 1) * weapon.spread;
      args.out.push(
        spawnNpcShot(
          args.x,
          args.y,
          args.heading + offset,
          muzzle,
          args.source,
          args.hostile,
          {
            family: "gun",
            speed: WEAPONS.gun.pelletSpeed,
            radius: WEAPONS.gun.pelletRadius,
            damage: 0,
            shieldMultiplier: weapon.shieldMultiplier,
            gunSlotId: `${args.ownerId}:${i}`,
            gunChunkDamage: weapon.damage,
            gunChunkInterval: weapon.timeOnTarget,
          },
        ),
      );
    } else if (weapon.family === "cannon") {
      args.out.push(
        spawnNpcShot(args.x, args.y, args.heading, muzzle, args.source, args.hostile, {
          family: "cannon",
          speed: WEAPONS.cannon.slugSpeed,
          radius: WEAPONS.cannon.slugRadius,
          damage: weapon.damage,
          shieldMultiplier: weapon.shieldMultiplier,
        }),
      );
    } else {
      args.out.push(
        spawnNpcShot(args.x, args.y, args.heading, muzzle, args.source, args.hostile, {
          family: "missile",
          speed: WEAPONS.missile.speed,
          radius: WEAPONS.missile.radius,
          damage: weapon.damage,
          shieldMultiplier: weapon.shieldMultiplier,
          turnRate: weapon.trackingTurn,
          trackSeconds: weapon.trackSeconds,
          lockId: args.lockId,
        }),
      );
    }
    args.cooldowns[i] = weapon.fireCooldown;
  }
}

export function tickWeaponCooldowns(cooldowns: number[], dt: number): void {
  for (let i = 0; i < cooldowns.length; i += 1) {
    cooldowns[i] = Math.max(0, (cooldowns[i] ?? 0) - dt);
  }
}
