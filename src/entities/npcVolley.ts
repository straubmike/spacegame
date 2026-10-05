import { WEAPONS } from "../game/config";
import type { ResolvedNpcFit } from "../ship/npcLoadout";
import {
  OFF_BRACKET_FIRE_CHANCE,
  OFF_BRACKET_GUN_INTERVAL,
  rangeBracket,
} from "./rangeBand";
import { spawnNpcShot, type Projectile, type ProjectileSource } from "./Projectile";

/** Missile lock id for the player. Not added to lockable targets. */
export const PLAYER_LOCK_ID = "player";

/**
 * Fire ready weapons. The family that matches the current distance bracket
 * fires on its module cooldown. Other equipped families take an occasional
 * shot instead of a full volley. Magazines are not consumed. Player shots
 * do not use this path.
 */
export function fireNpcVolley(args: {
  fit: ResolvedNpcFit;
  ownerId: string;
  x: number;
  y: number;
  heading: number;
  /** Distance to the thing being shot. Picks the primary weapon bracket. */
  dist: number;
  cooldowns: number[];
  hostile: boolean;
  source: Exclude<ProjectileSource, "player">;
  lockId: string;
  out: Projectile[];
  /** Fraction of the module lock. Omitted keeps the module (NPC aim only). */
  missileTrackScale?: number;
  /** Fraction of the module turn rate. Omitted keeps the module. */
  missileTurnScale?: number;
}): void {
  const muzzle = args.fit.size;
  const primary = rangeBracket(args.dist);
  for (let i = 0; i < args.fit.weapons.length; i += 1) {
    if ((args.cooldowns[i] ?? 0) > 0) continue;
    const weapon = args.fit.weapons[i]!.module;
    // Energy weapons are player-only. Do not invent a kinetic shot for them.
    if (weapon.family === "pulse" || weapon.family === "beam") continue;
    const onBracket = weapon.family === primary;
    let cooldown = weapon.fireCooldown;
    if (!onBracket) {
      const retry =
        weapon.family === "gun" ? OFF_BRACKET_GUN_INTERVAL : weapon.fireCooldown;
      if (Math.random() >= OFF_BRACKET_FIRE_CHANCE) {
        args.cooldowns[i] = retry;
        continue;
      }
      cooldown = retry;
    }
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
            speed: weapon.speed,
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
          speed: weapon.speed,
          radius: WEAPONS.cannon.slugRadius,
          damage: weapon.damage,
          shieldMultiplier: weapon.shieldMultiplier,
        }),
      );
    } else if (weapon.family === "missile") {
      args.out.push(
        spawnNpcShot(args.x, args.y, args.heading, muzzle, args.source, args.hostile, {
          family: "missile",
          speed: weapon.speed,
          radius: WEAPONS.missile.radius,
          damage: weapon.damage,
          shieldMultiplier: weapon.shieldMultiplier,
          turnRate: weapon.trackingTurn * (args.missileTurnScale ?? 1),
          trackSeconds: weapon.trackSeconds * (args.missileTrackScale ?? 1),
          lockId: args.lockId,
        }),
      );
    }
    args.cooldowns[i] = cooldown;
  }
}

export function tickWeaponCooldowns(cooldowns: number[], dt: number): void {
  for (let i = 0; i < cooldowns.length; i += 1) {
    cooldowns[i] = Math.max(0, (cooldowns[i] ?? 0) - dt);
  }
}
