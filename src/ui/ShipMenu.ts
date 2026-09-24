import {
  formatAmmo,
  formatWarp,
  rateOfFire,
  slotKindLabel,
  swapCost,
  tierLabel,
  type EquipModule,
  type ShipSlot,
} from "../ship/equipment";
import type { ShipLoadout } from "../ship/Loadout";
import {
  stockForSlot,
  wealthLabel,
  type StationWealth,
} from "../ship/stationStock";
import { FONT, FONT_TITLE, drawButton, drawPanel, hit, type Rect } from "./menu";

export type ShipMenuMode = "view" | "bay";

export type ShipMenuClickResult =
  | "close"
  | { action: "install"; module: EquipModule }
  | null;

interface StatRow {
  label: string;
  /** Display value for this module. */
  text: string;
  /** Comparable magnitude; null when delta is not meaningful. */
  value: number | null;
}

/**
 * Ship loadout inspector (keyboard) and station Bay (docked refit).
 * View mode is read-only. Bay mode swaps modules against station stock —
 * no spare-parts inventory; the old module is traded in.
 */
export class ShipMenu {
  mode: ShipMenuMode = "view";
  selectedIndex = 0;
  selectedOfferIndex = 0;
  /** Modules this station sells (bay mode only). */
  stock: EquipModule[] = [];
  /** Bay wealth label (bay mode only). */
  wealth: StationWealth | null = null;

  private slotRects: Rect[] = [];
  private offerRects: Rect[] = [];
  private installBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private closeBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private offers: EquipModule[] = [];

  openView(): void {
    this.mode = "view";
    this.stock = [];
    this.wealth = null;
    this.selectedOfferIndex = 0;
  }

  openBay(stock: EquipModule[], wealth: StationWealth | null = null): void {
    this.mode = "bay";
    this.stock = stock;
    this.wealth = wealth;
    this.selectedOfferIndex = 0;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    loadout: ShipLoadout,
    credits: number,
    width: number,
    height: number,
    pointerX: number,
    pointerY: number,
    hullName = "Ship",
  ): void {
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(0, 0, width, height);

    const panelW = this.mode === "bay" ? Math.min(920, width - 40) : 520;
    const panelH = Math.min(this.mode === "bay" ? 520 : 400, height - 40);
    const panel: Rect = {
      x: Math.floor((width - panelW) / 2),
      y: Math.floor((height - panelH) / 2),
      w: panelW,
      h: panelH,
    };
    drawPanel(ctx, panel);

    ctx.font = FONT_TITLE;
    ctx.fillStyle = "rgba(220, 235, 255, 0.95)";
    ctx.textBaseline = "top";
    ctx.fillText(this.mode === "bay" ? "Bay" : hullName, panel.x + 20, panel.y + 18);

    ctx.font = FONT;
    ctx.fillStyle = "rgba(150, 175, 210, 0.75)";
    const subtitle = this.mode === "bay" ? `${hullName} · Refit` : "Loadout";
    ctx.fillText(subtitle, panel.x + panel.w - (this.mode === "bay" ? 140 : 88), panel.y + 22);

    if (this.mode === "bay") {
      ctx.fillStyle = "rgba(180, 200, 230, 0.85)";
      const wealthBit = this.wealth ? ` · ${wealthLabel(this.wealth)}` : "";
      ctx.fillText(`CR ${credits}${wealthBit}`, panel.x + 20, panel.y + 40);
    }

    const listX = panel.x + 16;
    const listY = panel.y + (this.mode === "bay" ? 64 : 56);
    const listW = 160;
    const rowH = 44;
    const footerY = panel.y + panel.h - 50;

    this.slotRects = [];
    loadout.slots.forEach((slot, i) => {
      const row: Rect = {
        x: listX,
        y: listY + i * rowH,
        w: listW,
        h: rowH - 6,
      };
      this.slotRects.push(row);
      const selected = i === this.selectedIndex;
      const hovered = hit(row, pointerX, pointerY);

      if (selected) {
        ctx.fillStyle = "rgba(50, 110, 170, 0.45)";
      } else if (hovered) {
        ctx.fillStyle = "rgba(40, 55, 75, 0.55)";
      } else {
        ctx.fillStyle = "rgba(20, 28, 40, 0.55)";
      }
      ctx.fillRect(row.x, row.y, row.w, row.h);
      ctx.strokeStyle = selected
        ? "rgba(140, 200, 255, 0.65)"
        : "rgba(90, 115, 145, 0.35)";
      ctx.strokeRect(row.x, row.y, row.w, row.h);

      ctx.font = FONT;
      ctx.fillStyle = "rgba(220, 235, 255, 0.95)";
      ctx.textBaseline = "top";
      ctx.fillText(slot.label, row.x + 10, row.y + 8);
      ctx.fillStyle = "rgba(150, 170, 200, 0.8)";
      ctx.fillText(
        slot.equipped ? slot.equipped.name : "Empty",
        row.x + 10,
        row.y + 24,
      );
    });

    const slot = loadout.slots[this.selectedIndex] ?? loadout.slots[0]!;
    this.offerRects = [];
    this.offers = [];
    this.installBtn = { x: 0, y: 0, w: 0, h: 0 };

    if (this.mode === "bay") {
      this.offers = stockForSlot(this.stock, slot.kind);
      if (this.selectedOfferIndex >= this.offers.length) {
        this.selectedOfferIndex = 0;
      }
      const offer = this.offers[this.selectedOfferIndex] ?? null;

      const compareX = listX + listW + 14;
      const stockListW = 168;
      const compareAreaW = panel.x + panel.w - 16 - stockListW - 12 - compareX;
      const colW = Math.floor((compareAreaW - 12) / 2);
      const offerColX = compareX + colW + 12;
      const stockListX = panel.x + panel.w - 16 - stockListW;

      this.drawCompareColumn(
        ctx,
        compareX,
        listY,
        colW,
        footerY - listY - 8,
        "Fitted",
        slot.equipped,
        offer,
        loadout,
        true,
      );
      this.drawCompareColumn(
        ctx,
        offerColX,
        listY,
        colW,
        footerY - listY - 8,
        "Selected stock",
        offer,
        null,
        loadout,
        false,
      );
      this.drawStockList(
        ctx,
        stockListX,
        listY,
        stockListW,
        footerY - listY - 64,
        slot,
        credits,
        pointerX,
        pointerY,
      );
    } else {
      this.drawCompareColumn(
        ctx,
        listX + listW + 14,
        listY,
        panel.w - listW - 48,
        footerY - listY - 8,
        slotKindLabel(slot.kind),
        slot.equipped,
        null,
        loadout,
        false,
      );
    }

    this.closeBtn = {
      x: panel.x + panel.w - 120,
      y: footerY,
      w: 88,
      h: 36,
    };
    drawButton(ctx, this.closeBtn, "Close", {
      hover: hit(this.closeBtn, pointerX, pointerY),
    });
  }

  private drawCompareColumn(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    _maxH: number,
    title: string,
    mod: EquipModule | null,
    /** When set on fitted column, show deltas vs this candidate. */
    compareAgainst: EquipModule | null,
    loadout: ShipLoadout,
    showDeltas: boolean,
  ): void {
    ctx.font = FONT_TITLE;
    ctx.fillStyle = "rgba(220, 235, 255, 0.95)";
    ctx.textBaseline = "top";
    ctx.fillText(title, x, y);

    if (!mod) {
      ctx.font = FONT;
      ctx.fillStyle = "rgba(150, 170, 200, 0.85)";
      ctx.fillText("Empty", x, y + 32);
      ctx.fillStyle = "rgba(120, 140, 165, 0.75)";
      const tip =
        this.mode === "bay"
          ? showDeltas
            ? "Choose stock to install."
            : "Select a module."
          : "Dock and open Bay to refit.";
      ctx.fillText(tip, x, y + 52);
      return;
    }

    ctx.font = FONT;
    ctx.fillStyle = "rgba(200, 220, 245, 0.95)";
    ctx.fillText(`${mod.name}  (${tierLabel(mod.tier)})`, x, y + 28);

    ctx.fillStyle = "rgba(140, 160, 190, 0.85)";
    const blurbLines = wrapText(mod.blurb, Math.max(18, Math.floor(w / 7)));
    let by = y + 50;
    for (const line of blurbLines.slice(0, 3)) {
      ctx.fillText(line, x, by);
      by += 16;
    }

    by += 10;
    const rows = moduleStatRows(mod, loadout);
    const otherRows =
      showDeltas && compareAgainst && compareAgainst.kind === mod.kind
        ? moduleStatRows(compareAgainst, loadout)
        : null;

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]!;
      ctx.fillStyle = "rgba(180, 200, 230, 0.9)";
      ctx.fillText(`${row.label}  ${row.text}`, x, by);

      if (otherRows) {
        const other = otherRows[i];
        if (
          other &&
          row.value !== null &&
          other.value !== null &&
          Number.isFinite(row.value) &&
          Number.isFinite(other.value)
        ) {
          const delta = other.value - row.value;
          if (Math.abs(delta) > 1e-6) {
            const label = formatDelta(delta);
            const tw = ctx.measureText(`${row.label}  ${row.text}`).width;
            ctx.fillStyle =
              delta > 0 ? "rgba(90, 210, 130, 0.95)" : "rgba(230, 100, 100, 0.95)";
            ctx.fillText(label, x + tw + 8, by);
          }
        }
      }
      by += 18;
    }

    by += 6;
    ctx.fillStyle = "rgba(160, 180, 210, 0.8)";
    ctx.fillText(`List  ${mod.price} cr`, x, by);
  }

  private drawStockList(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    listH: number,
    slot: ShipSlot,
    credits: number,
    pointerX: number,
    pointerY: number,
  ): void {
    ctx.font = FONT_TITLE;
    ctx.fillStyle = "rgba(220, 235, 255, 0.95)";
    ctx.textBaseline = "top";
    ctx.fillText("Stock", x, y);

    if (this.offers.length === 0) {
      ctx.font = FONT;
      ctx.fillStyle = "rgba(150, 170, 200, 0.8)";
      ctx.fillText("Nothing here.", x, y + 30);
      return;
    }

    const rowH = 34;
    let oy = y + 30;
    const listBottom = y + listH;

    this.offers.forEach((offer, i) => {
      if (oy + rowH > listBottom) return;
      const row: Rect = { x, y: oy, w, h: rowH - 4 };
      this.offerRects.push(row);
      const selected = i === this.selectedOfferIndex;
      const hovered = hit(row, pointerX, pointerY);
      const installed = slot.equipped?.id === offer.id;

      if (selected) ctx.fillStyle = "rgba(50, 110, 170, 0.4)";
      else if (hovered) ctx.fillStyle = "rgba(40, 55, 75, 0.5)";
      else ctx.fillStyle = "rgba(18, 26, 36, 0.55)";
      ctx.fillRect(row.x, row.y, row.w, row.h);
      ctx.strokeStyle = selected
        ? "rgba(140, 200, 255, 0.55)"
        : "rgba(80, 100, 130, 0.35)";
      ctx.strokeRect(row.x, row.y, row.w, row.h);

      ctx.font = FONT;
      ctx.fillStyle = "rgba(220, 235, 255, 0.95)";
      ctx.textBaseline = "middle";
      const mark = tierLabel(offer.tier);
      const base =
        offer.name.length > 12 ? `${offer.name.slice(0, 11)}…` : offer.name;
      const name = installed ? `${base} ✓` : `${base} ${mark}`;
      ctx.fillText(name, row.x + 8, row.y + row.h / 2);
      oy += rowH;
    });

    const offer = this.offers[this.selectedOfferIndex]!;
    const installed = slot.equipped?.id === offer.id;
    const cost = swapCost(slot.equipped, offer);
    const canAfford = credits >= cost;
    const canInstall = !installed && canAfford;

    ctx.font = FONT;
    ctx.fillStyle = "rgba(160, 180, 210, 0.85)";
    ctx.textBaseline = "top";
    const costY = listBottom + 4;
    const costLine = installed
      ? "Already fitted"
      : cost === 0
        ? "Free (trade-in)"
        : `${cost} cr`;
    ctx.fillText(costLine, x, costY);

    this.installBtn = {
      x,
      y: costY + 20,
      w,
      h: 32,
    };
    drawButton(
      ctx,
      this.installBtn,
      installed ? "Fitted" : cost === 0 ? "Install" : `Install (−${cost})`,
      {
        primary: canInstall,
        enabled: canInstall,
        hover: canInstall && hit(this.installBtn, pointerX, pointerY),
      },
    );
  }

  handleClick(
    loadout: ShipLoadout,
    px: number,
    py: number,
  ): ShipMenuClickResult {
    if (hit(this.closeBtn, px, py)) return "close";

    for (let i = 0; i < this.slotRects.length; i += 1) {
      if (hit(this.slotRects[i]!, px, py) && loadout.slots[i]) {
        this.selectedIndex = i;
        this.selectedOfferIndex = 0;
        return null;
      }
    }

    if (this.mode === "bay") {
      for (let i = 0; i < this.offerRects.length; i += 1) {
        if (hit(this.offerRects[i]!, px, py) && this.offers[i]) {
          this.selectedOfferIndex = i;
          return null;
        }
      }

      if (hit(this.installBtn, px, py)) {
        const slot = loadout.slots[this.selectedIndex];
        const offer = this.offers[this.selectedOfferIndex];
        if (!slot || !offer) return null;
        if (slot.equipped?.id === offer.id) return null;
        return { action: "install", module: offer };
      }
    }

    return null;
  }
}

function moduleStatRows(mod: EquipModule, loadout: ShipLoadout): StatRow[] {
  if (mod.kind === "weapon") {
    const ammo =
      loadout.weapon?.id === mod.id
        ? loadout.ammo
        : mod.ammoMax === null
          ? Infinity
          : mod.ammoMax;
    const rof = rateOfFire(mod.fireCooldown);
    return [
      {
        label: "Rate of fire",
        text: `${rof.toFixed(2)} /s`,
        value: rof,
      },
      {
        label: "Ammunition",
        text: formatAmmo(mod.ammoMax, ammo),
        value: mod.ammoMax,
      },
      {
        label: "Damage",
        text: `${mod.damage}`,
        value: mod.damage,
      },
    ];
  }
  if (mod.kind === "drive") {
    const turnDeg = (mod.turnRate * 180) / Math.PI;
    const warp =
      loadout.drive?.id === mod.id
        ? loadout.warpCharges
        : mod.warpChargesMax === null
          ? Infinity
          : mod.warpChargesMax;
    return [
      {
        label: "Thrust",
        text: `${mod.thrustAccel.toFixed(0)}`,
        value: mod.thrustAccel,
      },
      {
        label: "Reverse",
        text: `${mod.reverseAccel.toFixed(0)}`,
        value: mod.reverseAccel,
      },
      {
        label: "Top speed",
        text: `${mod.maxSpeed.toFixed(0)}`,
        value: mod.maxSpeed,
      },
      {
        label: "Turn rate",
        text: `${turnDeg.toFixed(0)}°/s`,
        value: turnDeg,
      },
      {
        label: "Jump range",
        text: `${mod.jumpRange.toFixed(0)} ly`,
        value: mod.jumpRange,
      },
      {
        label: "Warp charges",
        text: formatWarp(mod.warpChargesMax, warp),
        value: mod.warpChargesMax,
      },
    ];
  }
  return [
    {
      label: "Shield max",
      text: `${mod.shieldMax}`,
      value: mod.shieldMax,
    },
    {
      label: "Regen delay",
      text: `${mod.shieldRegenDelay.toFixed(1)} s`,
      value: mod.shieldRegenDelay,
    },
    {
      label: "Regen rate",
      text: `${mod.shieldRegenRate.toFixed(1)} /s`,
      value: mod.shieldRegenRate,
    },
    {
      label: "Hull bonus",
      text: `+${mod.hullBonus}`,
      value: mod.hullBonus,
    },
    {
      label: "Cargo",
      text: `${mod.cargoCapacity} CU`,
      value: mod.cargoCapacity,
    },
    {
      label: "Passengers",
      text: `${mod.passengerCapacity}`,
      value: mod.passengerCapacity,
    },
  ];
}

function formatDelta(delta: number): string {
  const rounded =
    Math.abs(delta) >= 10
      ? delta.toFixed(0)
      : Math.abs(delta) >= 1
        ? delta.toFixed(1)
        : delta.toFixed(2);
  const n = Number(rounded);
  if (n === 0) return "";
  return n > 0 ? `+${stripTrailingZeros(rounded)}` : stripTrailingZeros(rounded);
}

function stripTrailingZeros(s: string): string {
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "");
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
