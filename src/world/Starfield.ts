import { STARFIELD } from "../game/config";
import { mulberry32 } from "../galaxy/rng";

interface Star {
  /** 0–1 across the viewport (infinite-distance backdrop). */
  u: number;
  v: number;
}

interface Layer {
  size: number;
  alpha: number;
  stars: Star[];
}

/**
 * Distant star backdrop locked to the screen — no parallax.
 * Local sun/stations move in world space; these stay put like a skybox.
 */
export class Starfield {
  private readonly layers: Layer[];

  constructor(seed = 42) {
    const rng = mulberry32(seed);
    this.layers = STARFIELD.layers.map((cfg) => ({
      size: cfg.size,
      alpha: cfg.alpha,
      stars: Array.from({ length: cfg.count }, () => ({
        u: rng(),
        v: rng(),
      })),
    }));
  }

  /** New backdrop pattern when entering a system. */
  reseed(seed: number): void {
    const rng = mulberry32(seed);
    for (const layer of this.layers) {
      for (const star of layer.stars) {
        star.u = rng();
        star.v = rng();
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    for (const layer of this.layers) {
      ctx.fillStyle = `rgba(220, 230, 255, ${layer.alpha})`;
      for (const star of layer.stars) {
        ctx.beginPath();
        ctx.arc(star.u * width, star.v * height, layer.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
