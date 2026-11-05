// KICKER 6.2: the scroll moments. Every one of them watches the page scroll go by and never touches it: one passive
// scroll listener and a few IntersectionObservers, transforms and opacity only, nothing that moves the layout.
// With prefers-reduced-motion everything stays still (html.motion is never set) and only the toast can appear.
//   1. the kicker on the cover slides along his rod as the cover scrolls away, and his eyes follow the way he goes;
//   2. the meme panels slide in sideways, one after another, as they come into view (never a spin);
//   3. today's rod: the kickers slide onto the rod when it comes into view and a ball rolls across the felt;
//   4. scroll back and forth hard and the page says "no spinning."
import { traitsOf } from "../../shared/k6.js";
import { HOUSE } from "../../shared/k6look.js";
import type { Hero } from "./hero.js";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function motion(hero: Hero) {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!still) document.documentElement.classList.add("motion");
  spinToast();
  if (still) return;
  glide(hero);
  memesIn();
  rodRoll();
}

// ---------------------------------------------------------------- 1. the kicker glides along his rod, his eyes follow
function glide(hero: Hero) {
  const root = $("hero");
  const slide = $("hero-slide");
  let room = 0;
  let lastX = 0;
  let ticking = false;
  const measure = () => (room = hero.room());
  const frame = () => {
    ticking = false;
    const h = root.offsetHeight;
    if (scrollY > h + 200 && lastX !== 0) return;
    const p = Math.max(0, Math.min(1, scrollY / (h * 0.7)));
    // ease out: a firm push off, then the rod coasts to the end of its travel
    const e = 1 - (1 - p) ** 2;
    const dir = traitsOf(hero.n).look;
    const x = Math.round(e * room * dir);
    slide.style.transform = x ? `translate3d(${x}px,0,0)` : "";
    if (x === 0) hero.rest();
    else if (Math.abs(x - lastX) >= 1) hero.look(x > lastX ? 1 : -1);
    lastX = x;
  };
  const kick = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(frame);
  };
  addEventListener("scroll", kick, { passive: true });
  addEventListener("resize", () => {
    measure();
    kick();
  });
  root.addEventListener("kicker", () => {
    // a new kicker in the middle: measure again and put the rod where the scroll says
    requestAnimationFrame(() => {
      measure();
      lastX = 0;
      frame();
    });
  });
  measure();
}

// ---------------------------------------------------------------- 2. the memes slide in sideways
function memesIn() {
  const io = new IntersectionObserver(
    (es) => {
      for (const e of es) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        e.target.classList.add("in");
      }
    },
    { threshold: 0.2 },
  );
  for (const li of document.querySelectorAll(".grid .mm")) io.observe(li);
}

// ---------------------------------------------------------------- 3. today's rod: onto the rod, and a ball rolls by
function rodRoll() {
  const band = $("band");
  const run = document.createElement("div");
  run.className = "ball-run";
  run.setAttribute("aria-hidden", "true");
  const ball = document.createElement("canvas");
  ball.className = "ball";
  // a 7 x 7 pixel ball: ink ring, cream body, two ink patches
  const P = ["..xxx..", ".xcccx.", "xccxccx", "xcxxxcx", "xccxccx", ".xcccx.", "..xxx.."];
  ball.width = 7;
  ball.height = 7;
  const g = ball.getContext("2d")!;
  P.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === ".") return;
      g.fillStyle = c === "x" ? HOUSE.ink : HOUSE.cream;
      g.fillRect(x, y, 1, 1);
    }),
  );
  const size = () => {
    const s = Number(getComputedStyle(band).getPropertyValue("--s")) || 4;
    ball.style.width = ball.style.height = `${7 * s}px`;
  };
  size();
  addEventListener("resize", size);
  run.append(ball);
  band.append(run);
  const io = new IntersectionObserver(
    (es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io.disconnect();
      band.classList.add("go");
    },
    { threshold: 0.4 },
  );
  io.observe(band);
}

// ---------------------------------------------------------------- 4. "no spinning."
function spinToast() {
  const toast = $("toast");
  let dir = 0;
  let lastY = scrollY;
  let runFrom = scrollY;
  let flips: number[] = [];
  let quietUntil = 0;
  let hide = 0;
  addEventListener(
    "scroll",
    () => {
      const y = scrollY;
      const d = Math.sign(y - lastY);
      lastY = y;
      if (!d) return;
      if (d !== dir) {
        const now = performance.now();
        // a flip counts when the run before it was a real push, not a nudge
        if (dir && Math.abs(y - runFrom) > 80) flips.push(now);
        flips = flips.filter((t) => now - t < 1800);
        dir = d;
        runFrom = y;
        if (flips.length >= 4 && now > quietUntil) {
          flips = [];
          quietUntil = now + 20000;
          toast.textContent = "no spinning.";
          toast.classList.add("on");
          clearTimeout(hide);
          hide = window.setTimeout(() => toast.classList.remove("on"), 2200);
        }
      }
    },
    { passive: true },
  );
}
