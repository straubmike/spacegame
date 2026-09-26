/**
 * Patrol knowledge / knownIllegalDebt — session ledger for illegal-cargo scans.
 *
 * On a positive scan the patrol records commodity + CU observed. Settlement
 * hands over remaining matching cargo + a steep fee for any shortfall
 * (fee for all debt if the hold is empty relative to the ledger).
 *
 * Illegal detection uses shared `isIllegalCommodityId` (Must-have 9 / 11).
 */

import { BLACK_MARKET, PATROL } from "../game/config";
import type { CargoHold } from "./CargoHold";
import {
  baseCommodityId,
  commodityById,
  isIllegalCommodityId,
} from "./market";

/** One commodity line the patrol knows about. */
export interface IllegalDebtLine {
  commodityId: string;
  name: string;
  cu: number;
}

export interface KnownIllegalDebt {
  stationKey: string;
  stationName: string;
  lines: IllegalDebtLine[];
}

export interface ScanSettleQuote {
  /** CU that will be confiscated from the hold (matching debt). */
  handOverCu: number;
  /** CU of debt not present in the hold. */
  shortfallCu: number;
  /** Credits charged for shortfall (0 when fully aboard). */
  feeCredits: number;
  /** Per-line breakdown for messaging. */
  lines: {
    commodityId: string;
    name: string;
    debtCu: number;
    handOverCu: number;
    shortfallCu: number;
    feeCredits: number;
  }[];
}

/** CU of illegal cargo currently in the hold, keyed by base commodity id. */
export function illegalCargoByCommodity(
  hold: CargoHold,
): Map<string, { name: string; cu: number }> {
  const map = new Map<string, { name: string; cu: number }>();
  for (const lot of hold.list()) {
    if (!isIllegalCommodityId(lot.id)) continue;
    const baseId = baseCommodityId(lot.id);
    const catalog = commodityById(baseId);
    const name = catalog?.name ?? lot.name;
    const prev = map.get(baseId);
    if (prev) {
      prev.cu += lot.cu;
    } else {
      map.set(baseId, { name, cu: lot.cu });
    }
  }
  return map;
}

export function totalIllegalCu(hold: CargoHold): number {
  let n = 0;
  for (const lot of hold.list()) {
    if (isIllegalCommodityId(lot.id)) n += lot.cu;
  }
  return n;
}

/**
 * Typical Black Market player-buy mid (approx) — fee must clear this.
 * buy ≈ base * (1 + premium) * (1 + spreadFraction/2)
 */
function blackMarketBuyReference(basePrice: number): number {
  const mid = basePrice * (1 + BLACK_MARKET.pricePremium);
  return Math.ceil(mid * (1 + BLACK_MARKET.spreadFraction / 2));
}

/**
 * Fee per CU shortfall — strictly above typical black-market buy rates.
 * Uses max(base * scanDebtFeeMul, BM-buy-ref + 1).
 */
export function scanDebtFeePerCu(commodityId: string): number {
  const base = commodityById(commodityId)?.basePrice ?? 40;
  const fromMul = Math.ceil(base * PATROL.scanDebtFeeMul);
  const aboveBm = blackMarketBuyReference(base) + 1;
  return Math.max(1, fromMul, aboveBm);
}

/**
 * Quote settlement for a known debt against the current hold.
 * Hand-over takes min(held, debt) per line; fee covers shortfall only.
 */
export function quoteScanSettle(
  debt: KnownIllegalDebt,
  hold: CargoHold,
): ScanSettleQuote {
  const held = illegalCargoByCommodity(hold);
  const lines: ScanSettleQuote["lines"] = [];
  let handOverCu = 0;
  let shortfallCu = 0;
  let feeCredits = 0;
  for (const line of debt.lines) {
    if (line.cu <= 0) continue;
    const aboard = held.get(line.commodityId)?.cu ?? 0;
    const take = Math.min(aboard, line.cu);
    const short = line.cu - take;
    const fee = short * scanDebtFeePerCu(line.commodityId);
    handOverCu += take;
    shortfallCu += short;
    feeCredits += fee;
    lines.push({
      commodityId: line.commodityId,
      name: line.name,
      debtCu: line.cu,
      handOverCu: take,
      shortfallCu: short,
      feeCredits: fee,
    });
  }
  return { handOverCu, shortfallCu, feeCredits, lines };
}

/**
 * Remove matching illegal CU from the hold (any lot whose base id matches).
 * Prefer non-stolen lots first, then stolen.
 */
export function confiscateIllegalCu(
  hold: CargoHold,
  commodityId: string,
  cu: number,
): number {
  if (cu <= 0 || !isIllegalCommodityId(commodityId)) return 0;
  let need = cu;
  let taken = 0;
  // Pass 1: plain catalog id.
  if (need > 0) {
    const got = hold.remove(commodityId, need);
    taken += got;
    need -= got;
  }
  // Pass 2: stolen: lots of the same base.
  if (need > 0) {
    const stolenId = `stolen:${commodityId}`;
    const got = hold.remove(stolenId, need);
    taken += got;
    need -= got;
  }
  return taken;
}

/** Merge observed CU into a mutable debt map (commodityId → line). */
export function addObservedIllegal(
  into: Map<string, IllegalDebtLine>,
  commodityId: string,
  cu: number,
  name?: string,
): void {
  if (cu <= 0 || !isIllegalCommodityId(commodityId)) return;
  const baseId = baseCommodityId(commodityId);
  const catalog = commodityById(baseId);
  const label = name ?? catalog?.name ?? baseId;
  const prev = into.get(baseId);
  if (prev) {
    prev.cu += cu;
  } else {
    into.set(baseId, { commodityId: baseId, name: label, cu });
  }
}

/**
 * Session store: knownIllegalDebt per station key.
 * Cleared on settle → Unfriendly, or when standing goes Hostile.
 */
export class ScanDebtLedger {
  private readonly byStation = new Map<string, KnownIllegalDebt>();

  get(stationKey: string): KnownIllegalDebt | null {
    return this.byStation.get(stationKey) ?? null;
  }

  has(stationKey: string): boolean {
    const d = this.byStation.get(stationKey);
    return !!d && d.lines.some((l) => l.cu > 0);
  }

  totalCu(stationKey: string): number {
    const d = this.byStation.get(stationKey);
    if (!d) return 0;
    return d.lines.reduce((n, l) => n + l.cu, 0);
  }

  /**
   * Record / replace debt from a positive scan.
   * Lines with cu ≤ 0 are dropped.
   */
  record(
    stationKey: string,
    stationName: string,
    lines: Iterable<IllegalDebtLine>,
  ): KnownIllegalDebt | null {
    const cleaned: IllegalDebtLine[] = [];
    for (const line of lines) {
      if (line.cu <= 0) continue;
      cleaned.push({
        commodityId: line.commodityId,
        name: line.name,
        cu: Math.floor(line.cu),
      });
    }
    if (cleaned.length === 0) {
      this.byStation.delete(stationKey);
      return null;
    }
    const debt: KnownIllegalDebt = {
      stationKey,
      stationName,
      lines: cleaned,
    };
    this.byStation.set(stationKey, debt);
    return debt;
  }

  clear(stationKey: string): void {
    this.byStation.delete(stationKey);
  }
}
