// KICKER 6.2: the quiet, optional sign-in for $KICKER holders. A small text link ("holding $KICKER? sign in for the
// gold rod") on the home page's footer and on /l/<token>. Nothing on the site needs it. Para's island is fetched only
// when the link is pressed (signin.ts -> src/para/island.ts); this file never touches a browser wallet. On a signed-in
// address the server reads balanceOf on the $KICKER token; a holder gets the gold rod: the launch meme is redrawn with
// a gold rod and a gold-leaf frame, and the home page's kicker stands on a gold rod (a "kicker:gold" event).
// Built as its own small entry too (dist/k6-gold.js), so the server-made /l/ page can load it.
import { onAddr, remembered, signIn, signOut } from "../side/signin.js";

const ADDR = /^0x[0-9a-f]{40}$/;
let addr: string | null = null;
let holder = false;

async function check(a: string | null) {
  addr = a && ADDR.test(a) ? a : null;
  holder = false;
  if (addr) {
    try {
      const r = await fetch(`/api/k6?holder=${addr}`);
      holder = r.ok && !!((await r.json()) as { holder?: boolean }).holder;
    } catch {
      holder = false;
    }
  }
  apply();
}

function apply() {
  document.documentElement.classList.toggle("gold", holder);
  dispatchEvent(new CustomEvent("kicker:gold", { detail: { holder, addr } }));
  // the launch meme and its Save: the same picture, with the gold rod
  for (const el of document.querySelectorAll<HTMLImageElement | HTMLAnchorElement>("[data-gold-src]")) {
    const base = el.dataset.goldSrc || "";
    const url = holder && addr ? `${base}&h=${addr}` : base;
    if (el instanceof HTMLImageElement) el.src = url + (el.dataset.goldW ? `&w=${el.dataset.goldW}` : "");
    else el.href = url;
  }
  for (const box of document.querySelectorAll<HTMLElement>("[data-gold]")) {
    const link = box.querySelector<HTMLButtonElement>("button");
    const say = box.querySelector<HTMLElement>(".gold-say");
    if (!link || !say) continue;
    if (!addr) {
      say.textContent = "holding $KICKER?";
      link.textContent = "sign in for the gold rod";
    } else if (holder) {
      say.textContent = "a $KICKER holder: the gold rod is yours.";
      link.textContent = "sign out";
    } else {
      say.textContent = "no $KICKER on that address. the brass rod it is.";
      link.textContent = "sign out";
    }
  }
}

function wire() {
  for (const box of document.querySelectorAll<HTMLElement>("[data-gold]")) {
    const link = box.querySelector<HTMLButtonElement>("button");
    if (!link || link.dataset.wired) continue;
    link.dataset.wired = "1";
    link.addEventListener("click", async () => {
      if (addr) {
        await signOut().catch(() => {});
        return void check(null);
      }
      link.setAttribute("aria-busy", "true");
      try {
        await signIn();
      } catch (e) {
        const say = box.querySelector<HTMLElement>(".gold-say");
        if (say) say.textContent = (e as Error).message || "sign-in is resting. everything works the same without it.";
      } finally {
        link.removeAttribute("aria-busy");
      }
    });
  }
  onAddr((a) => void check(a));
  // someone who signed in before: only the address remembered in this browser, no wallet, no Para
  const r = remembered();
  if (r) void check(r);
  else apply();
}

if (document.readyState === "loading") addEventListener("DOMContentLoaded", wire, { once: true });
else wire();

export const isGold = () => holder;
