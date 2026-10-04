import { FONT, FONT_TITLE, drawButton, drawPanel, hit, type Rect } from "./menu";

/**
 * Title card shown before a run starts.
 * Click Begin, or press Enter / Space.
 */
export class StartScreen {
  private panel: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private beginBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };

  layout(viewW: number, viewH: number): void {
    const w = 420;
    const h = 188;
    this.panel = {
      x: Math.floor((viewW - w) / 2),
      y: Math.floor((viewH - h) / 2),
      w,
      h,
    };
    const bw = 180;
    const bh = 32;
    this.beginBtn = {
      x: this.panel.x + Math.floor((w - bw) / 2),
      y: this.panel.y + 108,
      w: bw,
      h: bh,
    };
  }

  draw(
    ctx: CanvasRenderingContext2D,
    viewW: number,
    viewH: number,
    pointerX: number,
    pointerY: number,
  ): void {
    this.layout(viewW, viewH);
    drawPanel(ctx, this.panel);

    ctx.font = FONT_TITLE;
    ctx.fillStyle = "rgba(220, 235, 255, 0.95)";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText("Space Game", this.panel.x + 24, this.panel.y + 20);

    ctx.font = FONT;
    ctx.fillStyle = "rgba(180, 200, 225, 0.88)";
    ctx.fillText("Launch when ready.", this.panel.x + 24, this.panel.y + 52);

    drawButton(ctx, this.beginBtn, "Begin", {
      primary: true,
      hover: hit(this.beginBtn, pointerX, pointerY),
    });

    ctx.font = FONT;
    ctx.fillStyle = "rgba(150, 170, 200, 0.7)";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(
      "Enter or Space",
      this.panel.x + this.panel.w / 2,
      this.beginBtn.y + this.beginBtn.h + 14,
    );
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  hitsBegin(px: number, py: number): boolean {
    return hit(this.beginBtn, px, py);
  }
}

/**
 * Shown when the player ship is destroyed.
 * One control back to the title: click Start screen, or press Esc.
 */
export class GameOverScreen {
  private panel: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private titleBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };

  layout(viewW: number, viewH: number): void {
    const w = 420;
    const h = 188;
    this.panel = {
      x: Math.floor((viewW - w) / 2),
      y: Math.floor((viewH - h) / 2),
      w,
      h,
    };
    const bw = 180;
    const bh = 32;
    this.titleBtn = {
      x: this.panel.x + Math.floor((w - bw) / 2),
      y: this.panel.y + 108,
      w: bw,
      h: bh,
    };
  }

  draw(
    ctx: CanvasRenderingContext2D,
    viewW: number,
    viewH: number,
    pointerX: number,
    pointerY: number,
  ): void {
    this.layout(viewW, viewH);
    drawPanel(ctx, this.panel);

    ctx.font = FONT_TITLE;
    ctx.fillStyle = "rgba(230, 210, 160, 0.95)";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText("Ship destroyed", this.panel.x + 24, this.panel.y + 20);

    ctx.font = FONT;
    ctx.fillStyle = "rgba(200, 210, 230, 0.92)";
    ctx.fillText("This run is over.", this.panel.x + 24, this.panel.y + 52);

    drawButton(ctx, this.titleBtn, "Start screen", {
      primary: true,
      hover: hit(this.titleBtn, pointerX, pointerY),
    });

    ctx.font = FONT;
    ctx.fillStyle = "rgba(150, 170, 200, 0.7)";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(
      "Esc",
      this.panel.x + this.panel.w / 2,
      this.titleBtn.y + this.titleBtn.h + 14,
    );
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  hitsTitle(px: number, py: number): boolean {
    return hit(this.titleBtn, px, py);
  }
}
