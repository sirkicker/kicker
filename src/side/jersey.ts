// A small printed jersey (24 x 20 pixels) in a kit, for the fixture line and the editor's kit buttons.
import { tone, hexRgb, type Kit } from "../../shared/kicker.js";

/** A small printed jersey for the fixture line and the editor. */
export function jersey(c: HTMLCanvasElement, k: Kit, css = 1.5) {
  const W = 24;
  const H = 20;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const s = Math.max(1, Math.round(css * dpr));
  c.width = W * s;
  c.height = H * s;
  c.style.width = (W * s) / dpr + "px";
  c.style.height = (H * s) / dpr + "px";
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, c.width, c.height);
  const A = hexRgb(k.a);
  const B = hexRgb(k.b);
  const rgb = (x: [number, number, number]) => `rgb(${x[0]},${x[1]},${x[2]})`;
  const second = (x: number, y: number) => {
    switch (k.p) {
      case "hoops":
        return Math.floor(y / 3) % 2 === 1;
      case "stripes":
        return Math.floor(x / 3) % 2 === 1;
      case "halves":
        return x >= 12;
      case "sash":
        return Math.abs(x - 4 - y) <= 2;
      case "pin":
        return x % 4 === 2;
      case "quarters":
        return x >= 12 === y >= 10;
      case "band":
        return y >= 8 && y < 12;
      default:
        return false;
    }
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sleeve = y < 8 && (x < 5 || x >= 19) && y >= (x < 5 ? 5 - x : x - 18);
      const body = x >= 5 && x < 19 && !(y === 0 && x >= 9 && x < 15) && !(y === 1 && x >= 10 && x < 14);
      if (!sleeve && !body) continue;
      let c0 = second(x, y) ? B : A;
      if (y < 2 && body) c0 = B;
      if (sleeve && y === (x < 5 ? 5 - x : x - 18)) c0 = B;
      g.fillStyle = rgb(x >= 16 ? tone(c0, -0.18) : c0);
      g.fillRect(x * s, y * s, s, s);
    }
}

