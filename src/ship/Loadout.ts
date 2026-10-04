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
 * Each weapon slot keeps its own magazine — families do not share ammo.
 * Multiple slots of the same kind are allowed (hull layouts).
 */
export class ShipLoadout {
  readonly slots: ShipSlot[];
  /** Remaining rounds keyed by weapon slot id. Infinity when unlimited. */
  private readonly ammo = new Map<string, number>();
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

  get mineralScanRange(): number {
    let best = 0;
    for (const u of this.utilities()) {
      if (u.mineralScanRange > best) best = u.mineralScanRange;
    }
    return best;
  }

  get scoopRange(): number {
    let best = 0;
    for (const u of this.utilities()) {
      if (u.scoopRange > best) best = u.scoopRange;
    }
    return best;
  }

  /** Belt farming unlocks only when both scan and scoop capabilities are fitted. */
  get canProspectBelts(): boolean {
    return this.mineralScanRange > 0 && this.scoopRange > 0;
  }

  /** True if any utility slot has the given module id. */
  hasUtilityId(moduleId: string): boolean {
    return this.utilities().some((u) => u.id === moduleId);
  }

  slotByKind(kind: ShipSlot["kind"]): ShipSlot | undefined {
    return this.slots.find((s) => s.kind === kind);
  }

  slotsOfKind(kind: ShipSlot["kind"]): ShipSlot[] {
    return this.slots.filter((s) => s.kind === kind);
  }

  /** Restore ammo / warp pools from equipped module caps. */
  refillConsumables(): void {
    this.ammo.clear();
    for (const slot of this.slots) {
      const equipped = slot.equipped;
      if (equipped?.kind !== "weapon") continue;
      this.ammo.set(
        slot.id,
        equipped.ammoMax === null ? Number.POSITIVE_INFINITY : equipped.ammoMax,
      );
    }

    const drive = this.drive;
    this.warpCharges = drive
      ? drive.warpChargesMax === null
        ? Infinity
        : drive.warpChargesMax
      : 0;
  }

  ammoIn(slotId: string): number {
    return this.ammo.get(slotId) ?? 0;
  }

  canFireSlot(slotId: string): boolean {
    const slot = this.slots.find((s) => s.id === slotId);
    const equipped = slot?.equipped;
    if (!equipped || equipped.kind !== "weapon") return false;
    if (equipped.ammoMax === null) return true;
    return this.ammoIn(slotId) > 0;
  }

  consumeSlotAmmo(slotId: string, shots = 1): void {
    const cur = this.ammo.get(slotId);
    if (cur === undefined || !Number.isFinite(cur)) return;
    this.ammo.set(slotId, Math.max(0, cur - shots));
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

  /** Drive tank size (utilities / hull bonuses applied on Ship). */
  driveFuelCapacity(): number {
    return this.drive?.fuelCapacity ?? 0;
  }

  /** Sum of utility Expanded Fuel Tank (etc.) bonuses. */
  utilityFuelCapacity(): number {
    return this.utilities().reduce((sum, u) => sum + u.fuelCapacity, 0);
  }

  get hasFuelScoop(): boolean {
    return this.utilities().some((u) => u.fuelScoop);
  }

  /** Exploration / survey scan capability (Survey Scanner). */
  get hasPoiScan(): boolean {
    return this.utilities().some((u) => u.poiScan);
  }

  equip(slotId: string, module: EquipModule | null): boolean {
    const slot = this.slots.find((s) => s.id === slotId);
    if (!slot) return false;
    if (module && module.kind !== slot.kind) return false;
    slot.equipped = module ? { ...module } : null;
    this.refillConsumables();
    return true;
  }

  /** Independent copy — used so fleet hulls never share slot state. */
  clone(): ShipLoadout {
    const slots = this.slots.map((s) => ({
      id: s.id,
      kind: s.kind,
      label: s.label,
      equipped: s.equipped ? { ...s.equipped } : null,
    }));
    const copy = new ShipLoadout(slots);
    copy.ammo.clear();
    for (const [slotId, rounds] of this.ammo) copy.ammo.set(slotId, rounds);
    copy.warpCharges = this.warpCharges;
    return copy;
  }
}
