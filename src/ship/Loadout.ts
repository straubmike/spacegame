import {
  createStarterSlots,
  type DriveModule,
  type EquipModule,
  type ShipSlot,
  type UtilityModule,
  type WeaponModule,
} from "./equipment";

/**
 * Installed modules + consumable pools (ammo / warp) that refill on repair.
 * Multiple slots of the same kind are allowed (hull layouts).
 */
export class ShipLoadout {
  readonly slots: ShipSlot[];
  /** Current magazine; Infinity when weapon has unlimited ammo. */
  ammo = 0;
  /** Remaining hyperspace charges; Infinity when drive is unlimited. */
  warpCharges = 0;

  constructor(slots: ShipSlot[] = createStarterSlots()) {
    this.slots = slots;
    this.refillConsumables();
  }

  /** Primary (first) weapon — used when a single reference is enough. */
  get weapon(): WeaponModule | null {
    return this.weapons()[0] ?? null;
  }

  weapons(): WeaponModule[] {
    const list: WeaponModule[] = [];
    for (const s of this.slots) {
      if (s.equipped?.kind === "weapon") list.push(s.equipped);
    }
    return list;
  }

  get drive(): DriveModule | null {
    const m = this.slotByKind("drive")?.equipped;
    return m?.kind === "drive" ? m : null;
  }

  /** Primary (first) utility — prefer utilities() for summed bonuses. */
  get utility(): UtilityModule | null {
    return this.utilities()[0] ?? null;
  }

  utilities(): UtilityModule[] {
    const list: UtilityModule[] = [];
    for (const s of this.slots) {
      if (s.equipped?.kind === "utility") list.push(s.equipped);
    }
    return list;
  }

  slotByKind(kind: ShipSlot["kind"]): ShipSlot | undefined {
    return this.slots.find((s) => s.kind === kind);
  }

  slotsOfKind(kind: ShipSlot["kind"]): ShipSlot[] {
    return this.slots.filter((s) => s.kind === kind);
  }

  /** Restore ammo / warp pools from equipped module caps. */
  refillConsumables(): void {
    const weapons = this.weapons();
    if (weapons.length === 0) {
      this.ammo = 0;
    } else if (weapons.some((w) => w.ammoMax === null)) {
      this.ammo = Infinity;
    } else {
      this.ammo = weapons.reduce((sum, w) => sum + (w.ammoMax ?? 0), 0);
    }

    const drive = this.drive;
    this.warpCharges = drive
      ? drive.warpChargesMax === null
        ? Infinity
        : drive.warpChargesMax
      : 0;
  }

  canFire(): boolean {
    const weapons = this.weapons();
    if (weapons.length === 0) return false;
    return weapons.some((w) => w.ammoMax === null) || this.ammo > 0;
  }

  /** How many shots to spawn this press (one per fitted weapon that has ammo). */
  fireWeaponCount(): number {
    const weapons = this.weapons();
    if (weapons.length === 0) return 0;
    if (weapons.some((w) => w.ammoMax === null) || this.ammo >= weapons.length) {
      return weapons.length;
    }
    return Math.max(0, Math.floor(this.ammo));
  }

  consumeAmmo(shots = 1): void {
    if (!Number.isFinite(this.ammo)) return;
    this.ammo = Math.max(0, this.ammo - shots);
  }

  canJump(): boolean {
    const drive = this.drive;
    if (!drive) return false;
    return drive.warpChargesMax === null || this.warpCharges > 0;
  }

  consumeWarp(): void {
    const drive = this.drive;
    if (!drive || drive.warpChargesMax === null) return;
    this.warpCharges = Math.max(0, this.warpCharges - 1);
  }

  jumpRange(): number {
    return this.drive?.jumpRange ?? 0;
  }

  /** Shared fire spacing: fastest fitted weapon sets the cadence. */
  fireCooldown(): number {
    const weapons = this.weapons();
    if (weapons.length === 0) return Number.POSITIVE_INFINITY;
    return Math.min(...weapons.map((w) => w.fireCooldown));
  }

  equip(slotId: string, module: EquipModule | null): boolean {
    const slot = this.slots.find((s) => s.id === slotId);
    if (!slot) return false;
    if (module && module.kind !== slot.kind) return false;
    slot.equipped = module ? { ...module } : null;
    this.refillConsumables();
    return true;
  }
}
