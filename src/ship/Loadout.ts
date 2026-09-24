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

  get weapon(): WeaponModule | null {
    const m = this.slotByKind("weapon")?.equipped;
    return m?.kind === "weapon" ? m : null;
  }

  get drive(): DriveModule | null {
    const m = this.slotByKind("drive")?.equipped;
    return m?.kind === "drive" ? m : null;
  }

  /** First fitted utility (compat for single-slot call sites). */
  get utility(): UtilityModule | null {
    return this.utilities[0] ?? null;
  }

  /** All fitted utility modules (Utility 1 / Utility 2 / …). */
  get utilities(): UtilityModule[] {
    const out: UtilityModule[] = [];
    for (const slot of this.slots) {
      if (slot.kind === "utility" && slot.equipped?.kind === "utility") {
        out.push(slot.equipped);
      }
    }
    return out;
  }

  get mineralScanRange(): number {
    let best = 0;
    for (const u of this.utilities) {
      if (u.mineralScanRange > best) best = u.mineralScanRange;
    }
    return best;
  }

  get scoopRange(): number {
    let best = 0;
    for (const u of this.utilities) {
      if (u.scoopRange > best) best = u.scoopRange;
    }
    return best;
  }

  /** Belt farming unlocks only when both capabilities are fitted. */
  get canProspectBelts(): boolean {
    return this.mineralScanRange > 0 && this.scoopRange > 0;
  }

  get totalCargoCapacity(): number {
    let n = 0;
    for (const u of this.utilities) n += u.cargoCapacity;
    return n;
  }

  get totalPassengerCapacity(): number {
    let n = 0;
    for (const u of this.utilities) n += u.passengerCapacity;
    return n;
  }

  get totalHullBonus(): number {
    let n = 0;
    for (const u of this.utilities) n += u.hullBonus;
    return n;
  }

  /** Strongest shield module wins (not stacked). */
  get primaryShieldUtility(): UtilityModule | null {
    let best: UtilityModule | null = null;
    for (const u of this.utilities) {
      if (u.shieldMax <= 0) continue;
      if (!best || u.shieldMax > best.shieldMax) best = u;
    }
    return best;
  }

  slotByKind(kind: ShipSlot["kind"]): ShipSlot | undefined {
    return this.slots.find((s) => s.kind === kind);
  }

  /** Restore ammo / warp pools from equipped module caps. */
  refillConsumables(): void {
    const weapon = this.weapon;
    this.ammo = weapon
      ? weapon.ammoMax === null
        ? Infinity
        : weapon.ammoMax
      : 0;

    const drive = this.drive;
    this.warpCharges = drive
      ? drive.warpChargesMax === null
        ? Infinity
        : drive.warpChargesMax
      : 0;
  }

  canFire(): boolean {
    const weapon = this.weapon;
    if (!weapon) return false;
    return weapon.ammoMax === null || this.ammo > 0;
  }

  consumeAmmo(): void {
    const weapon = this.weapon;
    if (!weapon || weapon.ammoMax === null) return;
    this.ammo = Math.max(0, this.ammo - 1);
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

  fireCooldown(): number {
    return this.weapon?.fireCooldown ?? Number.POSITIVE_INFINITY;
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
