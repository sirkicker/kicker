// KICKER 5.2: the set as one wall. All 222 vibers in full colour, each cast as a kicker in his house kit, cut to a
// square at the shoulders and set in rows on felt; a brass rod runs through every row, so the wall reads as one big
// table. Fielded ones stand on lighter felt at full brightness with a brass corner; open ones are a little dimmed.
// One atlas picture (/vibers/set.png), asked for only when the wall is near the screen, drawn into one canvas at
// whole device pixels per sprite pixel. Links over the canvas carry hover, focus and the click to /k/<n>.
import { KROD, KROD_T, KW, composeKicker } from "../../shared/kicker.js";
import { FAMILIES, SET_SIZE, VIBERS, houseKit, setNo } from "../../shared/side.js";
import { viberHandle } from "../../shared/home.js";

export interface Fielded {
  id: string;
  day: string;
  name: string;
}
export type State = "all" | "in" | "open";

const ATLAS = "/vibers/set.png";
const COLS = 16;
/** The square a tile shows, in frame pixels: from above the head to just under the rod. */
const TX = 6;
const TY = 18;
const T = 84;
const FELT_GAP = [16, 46, 46];
const FELT_OPEN = [27, 70, 68];
const FELT_IN = [44, 104, 94];
const fam = VIBERS.map((n) => FAMILIES.find((f) => f.test(n))!.key);

export class Wall {
  private crops: (Uint8ClampedArray | null)[] = new Array(SET_SIZE).fill(null);
  private fielded: Record<string, Fielded> = {};
  private state: State = "all";
  private family = "";
  private s = 1;
  private cols = 1;
  private gap = 1;
  private dpr = 1;
  private loading: Promise<void> | null = null;
  private stage = document.createElement("canvas");
  private cv: HTMLCanvasElement;
  private links: HTMLElement;
  private tip: HTMLElement;
  private built = false;

  constructor(private root: HTMLElement) {
    this.cv = root.querySelector("canvas")!;
    this.links = root.querySelector(".wall-links")!;
    this.tip = root.querySelector(".wall-tip")!;
    this.stage.width = this.stage.height = T;
    this.links.append(this.tip);
    this.layout();
    // the atlas and the 222 castings wait until the wall is close
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          io.disconnect();
          void this.load();
        }
      },
      { rootMargin: "900px 0px" },
    );
    io.observe(root);
    // re-lay the wall whenever its width changes (a phone settles its viewport after the first script run)
    let w = this.root.clientWidth;
    new ResizeObserver(() => {
      const now = this.root.clientWidth;
      if (Math.abs(now - w) < 8) return;
      w = now;
      this.layout();
      this.draw();
    }).observe(this.root);
    this.links.addEventListener("pointerover", (e) => this.hint(e.target as HTMLElement));
    this.links.addEventListener("focusin", (e) => this.hint(e.target as HTMLElement));
    this.links.addEventListener("pointerleave", () => (this.tip.hidden = true));
    this.links.addEventListener("focusout", () => (this.tip.hidden = true));
  }

  count() {
    return Object.keys(this.fielded).length;
  }
  set(f: Record<string, Fielded>) {
    this.fielded = f;
    this.label();
    this.draw();
  }
  filter(state: State, family: string) {
    this.state = state;
    this.family = family;
    this.label();
    this.draw();
  }

  /** Columns and scale: whole device pixels per sprite pixel, tiles about 56 to 90 css px. */
  private layout() {
    this.dpr = Math.min(3, Math.max(1, Math.round((devicePixelRatio || 1) * 4) / 4));
    const W = this.root.clientWidth || document.documentElement.clientWidth;
    const want = W < 600 ? 54 : W < 1000 ? 72 : 84;
    this.s = Math.max(1, Math.round((want * this.dpr) / T));
    this.gap = Math.max(1, Math.round(2 * this.dpr));
    const tile = T * this.s;
    this.cols = Math.max(4, Math.floor((W * this.dpr + this.gap) / (tile + this.gap)));
    const rows = Math.ceil(SET_SIZE / this.cols);
    const cw = this.cols * tile + (this.cols - 1) * this.gap;
    const ch = rows * tile + (rows - 1) * this.gap;
    this.cv.width = cw;
    this.cv.height = ch;
    this.cv.style.width = cw / this.dpr + "px";
    this.cv.style.height = ch / this.dpr + "px";
    this.root.style.setProperty("--wh", ch / this.dpr + "px");
    this.root.style.setProperty("--ww", cw / this.dpr + "px");
    this.links.style.width = cw / this.dpr + "px";
    this.links.style.height = ch / this.dpr + "px";
    if (!this.built) {
      const frag = document.createDocumentFragment();
      for (let v = 1; v <= SET_SIZE; v++) {
        const a = document.createElement("a");
        a.href = `/k/${v}`;
        a.dataset.v = String(v);
        frag.append(a);
      }
      this.links.append(frag);
      this.built = true;
    }
    const p = (tile + this.gap) / this.dpr;
    const t = tile / this.dpr;
    this.links.querySelectorAll<HTMLAnchorElement>("a").forEach((a, i) => {
      a.style.left = (i % this.cols) * p + "px";
      a.style.top = Math.floor(i / this.cols) * p + "px";
      a.style.width = a.style.height = t + "px";
    });
    this.label();
  }

  private label() {
    this.links.querySelectorAll<HTMLAnchorElement>("a").forEach((a) => {
      const v = Number(a.dataset.v);
      const f = this.fielded[String(v)];
      a.setAttribute("aria-label", f ? `${setNo(v)}, fielded, first by ${f.name}` : `${setNo(v)}, ${viberHandle(v)}, open`);
      const on = this.match(v);
      a.tabIndex = on ? 0 : -1;
      a.classList.toggle("off", !on);
    });
  }

  private match(v: number) {
    const f = !!this.fielded[String(v)];
    if (this.state === "in" && !f) return false;
    if (this.state === "open" && f) return false;
    if (this.family && fam[v - 1] !== this.family) return false;
    return true;
  }

  private hint(el: HTMLElement) {
    const a = el.closest<HTMLAnchorElement>("a[data-v]");
    if (!a || a.classList.contains("off")) return void (this.tip.hidden = true);
    const v = Number(a.dataset.v);
    const f = this.fielded[String(v)];
    this.tip.innerHTML = `<span class="num">${String(v).padStart(3, "0")}</span> <span class="nm"></span>`;
    this.tip.querySelector(".nm")!.textContent = f ? f.name : viberHandle(v);
    this.tip.classList.toggle("in", !!f);
    this.tip.hidden = false;
    const x = parseFloat(a.style.left) + parseFloat(a.style.width) / 2;
    const y = parseFloat(a.style.top);
    const W = parseFloat(this.links.style.width);
    this.tip.style.left = Math.max(60, Math.min(W - 60, x)) + "px";
    this.tip.style.top = y + "px";
  }

  private async load() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const img = new Image();
      img.decoding = "async";
      img.src = ATLAS;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext("2d", { willReadFrequently: true })!;
      g.drawImage(img, 0, 0);
      const all = g.getImageData(0, 0, c.width, c.height).data;
      const W = c.width;
      // cast them a row of the wall at a time, drawing as they come, so the page never stalls
      for (let v = 1; v <= SET_SIZE; v++) {
        const src = new Uint8ClampedArray(96 * 96 * 4);
        const cx = ((v - 1) % COLS) * 96;
        const cy = Math.floor((v - 1) / COLS) * 96;
        for (let y = 0; y < 96; y++) src.set(all.subarray(((cy + y) * W + cx) * 4, ((cy + y) * W + cx + 96) * 4), y * 96 * 4);
        const k = composeKicker(src, houseKit(v));
        const crop = new Uint8ClampedArray(T * T * 4);
        for (let y = 0; y < T; y++) crop.set(k.px.subarray(((TY + y) * KW + TX) * 4, ((TY + y) * KW + TX + T) * 4), y * T * 4);
        this.crops[v - 1] = crop;
        if (v % this.cols === 0 || v === SET_SIZE) {
          this.draw();
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      this.root.classList.add("drawn");
    })().catch(() => {
      this.loading = null;
    });
    return this.loading;
  }

  private draw() {
    const g = this.cv.getContext("2d")!;
    const tile = T * this.s;
    const p = tile + this.gap;
    const rows = Math.ceil(SET_SIZE / this.cols);
    g.imageSmoothingEnabled = false;
    g.fillStyle = rgb(FELT_GAP);
    g.fillRect(0, 0, this.cv.width, this.cv.height);
    const sg = this.stage.getContext("2d")!;
    const rodTop = (KROD - TY - KROD_T / 2) * this.s;
    const rodH = KROD_T * this.s;
    for (let r = 0; r < rows; r++) {
      const y = r * p;
      // the felt squares of this row
      for (let c = 0; c < this.cols; c++) {
        const v = r * this.cols + c + 1;
        const on = v <= SET_SIZE && this.match(v);
        const inn = v <= SET_SIZE && !!this.fielded[String(v)];
        g.fillStyle = rgb(v > SET_SIZE ? FELT_OPEN : inn ? FELT_IN : FELT_OPEN, on ? 1 : 0.7);
        g.fillRect(c * p, y, tile, tile);
      }
      // the rod through the whole row, gutters and all
      const ry = y + rodTop;
      g.fillStyle = "#8a6a31";
      g.fillRect(0, ry, this.cv.width, rodH);
      g.fillStyle = "#c9a35a";
      g.fillRect(0, ry, this.cv.width, Math.max(1, Math.round(rodH * 0.55)));
      g.fillStyle = "#ead08c";
      g.fillRect(0, ry + Math.max(1, Math.round(this.s)), this.cv.width, Math.max(1, Math.round(this.s)));
      g.fillStyle = "rgba(10,30,30,0.35)";
      g.fillRect(0, ry + rodH, this.cv.width, Math.max(1, Math.round(this.s * 2)));
      // the men
      for (let c = 0; c < this.cols; c++) {
        const v = r * this.cols + c + 1;
        if (v > SET_SIZE) continue;
        const crop = this.crops[v - 1];
        if (!crop) continue;
        const inn = !!this.fielded[String(v)];
        const on = this.match(v);
        const img = new ImageData(new Uint8ClampedArray(crop) as Uint8ClampedArray<ArrayBuffer>, T, T);
        if (!inn || !on) dim(img.data, on ? 0.84 : 0.4, on ? FELT_OPEN : FELT_GAP, on ? 0.1 : 0.45);
        sg.clearRect(0, 0, T, T);
        sg.putImageData(img, 0, 0);
        g.drawImage(this.stage, 0, 0, T, T, c * p, y, tile, tile);
        if (inn && on) {
          // the brass corner: this one is in the set
          const m = Math.max(6, Math.round(tile * 0.13));
          g.fillStyle = "#d6b25e";
          g.beginPath();
          g.moveTo(c * p, y);
          g.lineTo(c * p + m, y);
          g.lineTo(c * p, y + m);
          g.closePath();
          g.fill();
        }
      }
    }
  }
}

const rgb = (c: number[], k = 1) => `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;
/** Darker by `k`, and `mix` of the way toward the felt, so an open slot sinks a little into the table. */
function dim(d: Uint8ClampedArray, k: number, to: number[], mix: number) {
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    d[i] = d[i] * k * (1 - mix) + to[0] * mix;
    d[i + 1] = d[i + 1] * k * (1 - mix) + to[1] * mix;
    d[i + 2] = d[i + 2] * k * (1 - mix) + to[2] * mix;
  }
}
