import { GALAXY } from "../game/config";
import { hash2, mulberry32 } from "../galaxy/rng";
import {
  CATALOG,
  cloneModule,
  MODULES,
  type EquipModule,
  type SlotKind,
} from "./equipment";
import { hashStationKey } from "./stationKey";

/**
 * Seeded bay inventory for a station.
 * Always stocks the starter weapon/drive plus a rolling mix of upgrades.
 * Prospecting gear (scanner / scoop) appears often so the belt loop is reachable.
 */
export function stationBayStock(stationKey: string): EquipModule[] {
  const rng = mulberry32(hash2(GALAXY.seed ^ 0xb1000d, hashStationKey(stationKey)));

  const stock: EquipModule[] = [
    cloneModule(MODULES.energyPulse),
    cloneModule(MODULES.basicDrive),
  ];

  const weapons = CATALOG.filter((m) => m.kind === "weapon" && m.id !== "energy_pulse");
  const drives = CATALOG.filter((m) => m.kind === "drive" && m.id !== "basic_drive");
  const utilities = CATALOG.filter((m) => m.kind === "utility");
  const prospecting = [
    MODULES.oreScanner,
    MODULES.cargoScoop,
  ];

  pickInto(stock, weapons, 1 + (rng() < 0.5 ? 1 : 0), rng);
  pickInto(stock, drives, 1 + (rng() < 0.45 ? 1 : 0), rng);
  pickInto(stock, utilities, 1 + (rng() < 0.6 ? 1 : 0), rng);
  // Bias: most stations stock at least one prospecting module.
  if (rng() < 0.75) {
    pickInto(stock, prospecting, 1 + (rng() < 0.55 ? 1 : 0), rng);
  }

  return stock;
}

export function stockForSlot(
  stock: EquipModule[],
  kind: SlotKind,
): EquipModule[] {
  return stock.filter((m) => m.kind === kind);
}

function pickInto(
  dest: EquipModule[],
  pool: EquipModule[],
  count: number,
  rng: () => number,
): void {
  const remaining = [...pool];
  for (let n = 0; n < count && remaining.length > 0; n += 1) {
    const i = Math.floor(rng() * remaining.length) % remaining.length;
    const pick = remaining.splice(i, 1)[0]!;
    if (!dest.some((m) => m.id === pick.id)) {
      dest.push(cloneModule(pick));
    }
  }
}
