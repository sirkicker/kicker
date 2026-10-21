// Unit tests: the Daily Deal seed and deck pin, the Daily board, the house-colours checks (plain keys and smart accounts)
// and the sign-in config. Runs on the in-memory store, no network: `npm test`.
// Add `--live` to also read $KICKER balances on Robinhood Chain testnet, `--anvil` to check a real ERC-1271 account on a local anvil.
import assert from "node:assert/strict";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { ENH, type Card, type Edition, type PoolCard, type Suit } from "../shared/data.js";
import { cardFacts, deckFacts, highlights, shopHint } from "../shared/insight.js";
import { Run, encodeTrail } from "../shared/engine.js";
import { botStep } from "../shared/bot.js";
import { mulberry32, normSeed } from "../shared/rng.js";
import { bumpStreak, dailySeed, dayLabel, dayStartHour, liveStreak, prevDay, utcDay } from "../shared/daily.js";
import { houseMessage, signinMessage } from "../shared/house.js";
import { mergeProfile, PROFILE_DAYS, PROFILE_RECENT, type Profile } from "../shared/profile.js";
import { getProfile, issueSession, receiptFor, receiptOk, sessionOf, signIn } from "../api/_me.js";
import { save } from "../api/_store.js";
import { dailyPin, publicBoard } from "../api/_daily.js";
import { verifyAndStore, getHall } from "../api/_runs.js";
import { checkHouse, claimOk, issueClaim, kickerBalance, smartAccountSigned, HouseError } from "../api/_house.js";
import { paraConfig } from "../src/para-config.js";
import { createWalletClient, custom, hashMessage, type Hex } from "viem";

// keep everything in memory, whatever the shell has set
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.HOUSE_SECRET;
delete process.env.HOUSE_RPC;

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.info("  ok  ", name);
  } catch (e) {
    failed++;
    console.info("  FAIL", name, "\n       ", (e as Error).message);
  }
}

/** A made-up deck: 30 launches per suit, enough for any seed. */
function fakeEdition(id: number): Edition {
  const r = mulberry32(id);
  const pool: PoolCard[][] = [[], [], [], []];
  for (let u = 0; u < 4; u++)
    for (let i = 0; i < 30; i++) {
      const p = Math.floor(r() * 10000);
      pool[u].push({
        t: "0x" + (id * 1000 + u * 100 + i).toString(16).padStart(40, "0"),
        s: `T${u}${i}`,
        n: `Test ${u}-${i}`,
        c: null,
        q: ["ETH", "NVDA", "VIBEVIBE", "USDG"][u],
        u: u as Suit,
        p,
        x: Math.floor(r() * 6000) - 3000,
        k: Math.floor(r() * 90),
        h: Math.floor(r() * 400),
        a: id * 3600 - Math.floor(r() * 400000),
        g: p > 9600,
        d: r() < 0.1,
      });
    }
  return { id, at: new Date(id * 3_600_000 + 60_000).toISOString(), block: "1", scanned: 120, dropped: 0, pool };
}

const putEdition = (ed: Edition) => save(`editions/${ed.id}.json`, ed);

/** A finished run: the greedy bot, or a lazy one that plays a single low card every hand. */
function playOut(ed: Edition, seed: string, lazy = false) {
  const run = new Run(ed, seed);
  let n = 0;
  while (n++ < 4000) {
    const s = run.s;
    if (lazy && s.phase === "round") {
      const ids = s.hand.slice().sort((a, b) => run.card(a).rank - run.card(b).rank).slice(0, Math.max(1, run.minPlay()));
      run.apply({ t: "play", c: ids });
      continue;
    }
    if (!botStep(run)) break;
  }
  assert.ok(run.s.phase === "over" || run.s.phase === "won", "run did not finish");
  return { trail: encodeTrail(run.trail), best: run.s.best?.total || 0 };
}

console.info("daily seed");
await test("same day, same seed; a valid seed code", () => {
  assert.equal(dailySeed("2026-10-14"), dailySeed("2026-10-14"));
  assert.equal(normSeed(dailySeed("2026-10-14")), dailySeed("2026-10-14"));
  assert.match(dailySeed("2026-10-14"), /^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
});
await test("a year of days, no repeats", () => {
  const seen = new Set<string>();
  let d = "2026-01-01";
  for (let i = 0; i < 366; i++) {
    seen.add(dailySeed(d));
    d = utcDay(new Date(Date.parse(d + "T00:00:00Z") + 86_400_000));
  }
  assert.equal(seen.size, 366);
});
await test("labels and day maths", () => {
  assert.equal(dayLabel("2026-10-14"), "Oct 14");
  assert.equal(dayLabel("2026-01-01"), "Jan 1");
  assert.equal(prevDay("2026-03-01"), "2026-02-28");
  assert.equal(dayStartHour("2026-10-14") * 3_600_000, Date.parse("2026-10-14T00:00:00Z"));
});
await test("streak: same day holds, next day adds, a gap resets", () => {
  let st = bumpStreak(null, "2026-10-12");
  assert.equal(st.n, 1);
  st = bumpStreak(st, "2026-10-12");
  assert.equal(st.n, 1);
  st = bumpStreak(st, "2026-10-13");
  st = bumpStreak(st, "2026-10-14");
  assert.equal(st.n, 3);
  assert.equal(liveStreak(st, "2026-10-15"), 3);
  assert.equal(liveStreak(st, "2026-10-16"), 0);
  st = bumpStreak(st, "2026-10-17");
  assert.deepEqual([st.n, st.best], [1, 3]);
});

console.info("deck pin");
const D1 = "2026-10-10";
const H1 = dayStartHour(D1);
await test("pins the first deck cut after 00:00 UTC, not the newest", async () => {
  await putEdition(fakeEdition(H1 - 1)); // yesterday's last deck
  await putEdition(fakeEdition(H1 + 2));
  await putEdition(fakeEdition(H1 + 5));
  const pin = await dailyPin(D1, (H1 + 6) * 3_600_000, async () => assert.fail("must not cut"));
  assert.equal(pin.edition, H1 + 2);
  assert.equal(pin.seed, dailySeed(D1));
});
await test("the pin never moves as hourly decks roll on", async () => {
  await putEdition(fakeEdition(H1 + 9));
  const pin = await dailyPin(D1, (H1 + 10) * 3_600_000, async () => assert.fail("must not cut"));
  assert.equal(pin.edition, H1 + 2);
});
await test("no deck yet today: cuts one and pins it; two first calls agree", async () => {
  const D = "2026-10-11";
  const H = dayStartHour(D);
  const now = (H + 3) * 3_600_000 + 1000;
  const [a, b] = await Promise.all([dailyPin(D, now, async () => ({ id: H + 3 })), dailyPin(D, now, async () => ({ id: H + 3 }))]);
  assert.equal(a.edition, H + 3);
  assert.equal(b.edition, a.edition);
});
await test("refuses to pin yesterday's deck when the index is down", async () => {
  const D = "2026-10-12";
  const H = dayStartHour(D);
  await assert.rejects(dailyPin(D, (H + 1) * 3_600_000, async () => ({ id: H - 1 })), /not cut yet/);
});
await test("no pin for a day that is not today", async () => {
  await assert.rejects(dailyPin("2026-09-01", Date.parse("2026-10-10T05:00:00Z"), async () => ({ id: 1 })), /no deal/);
});

console.info("daily board");
const today = utcDay();
const H = dayStartHour(today);
const NOW = Date.now();
const ed = fakeEdition(H);
await putEdition(ed);
const pin = await dailyPin(today, NOW, async () => assert.fail("must not cut"));
const seed = pin.seed;
const hi = playOut(ed, seed);
const lo = playOut(ed, seed, true);
await test("fixtures: two different finished runs of the day", () => {
  assert.equal(pin.edition, H);
  assert.ok(hi.best > lo.best, `bot ${hi.best} vs lazy ${lo.best}`);
});
await test("a verified daily run lands on the board", async () => {
  const rec = await verifyAndStore({ seed, edition: pin.edition, trail: lo.trail, name: "Ante" }, NOW);
  assert.equal(rec.daily, today);
  const b = await publicBoard(today);
  assert.equal(b.entries.length, 1);
  assert.equal(b.entries[0].total, lo.best);
  assert.equal(b.players, 1);
  assert.equal((b as unknown as { names?: unknown }).names, undefined, "name list must not be served");
});
await test("one line per name: a better run replaces it, names match case-blind", async () => {
  await verifyAndStore({ seed, edition: pin.edition, trail: hi.trail, name: "ANTE" }, NOW + 1000);
  const b = await publicBoard(today);
  assert.equal(b.entries.length, 1);
  assert.equal(b.entries[0].total, hi.best);
  assert.equal(b.players, 1);
});
await test("a worse run later does not replace the best", async () => {
  await verifyAndStore({ seed, edition: pin.edition, trail: lo.trail, name: "ante" }, NOW + 2000);
  const b = await publicBoard(today);
  assert.equal(b.entries.length, 1);
  assert.equal(b.entries[0].total, hi.best);
});
await test("another name gets its own line, sorted by score", async () => {
  await verifyAndStore({ seed, edition: pin.edition, trail: lo.trail, name: "Kicker" }, NOW + 3000);
  const b = await publicBoard(today);
  assert.deepEqual(
    b.entries.map((e) => e.name),
    ["ANTE", "Kicker"],
  );
  assert.equal(b.players, 2);
});
await test("a forged move list is rejected and changes nothing", async () => {
  const forged = hi.trail.replace(/p(\d+)/, "p999");
  await assert.rejects(verifyAndStore({ seed, edition: pin.edition, trail: forged, name: "Forger" }, NOW + 4000));
  const tail = hi.trail.split("_").slice(0, -3).join("_") + "_p0.1.2.3.4.5";
  await assert.rejects(verifyAndStore({ seed, edition: pin.edition, trail: tail, name: "Forger" }, NOW + 4000));
  const b = await publicBoard(today);
  assert.ok(!b.entries.some((e) => e.name === "Forger"));
  assert.equal(b.players, 2);
});
await test("the same seed on another deck is not the Daily Deal", async () => {
  const other = fakeEdition(H + 1);
  await putEdition(other);
  const run = playOut(other, seed);
  const rec = await verifyAndStore({ seed, edition: other.id, trail: run.trail, name: "Elsewhere" }, NOW + 5000);
  assert.equal(rec.daily, undefined);
  assert.ok(!(await publicBoard(today)).entries.some((e) => e.name === "Elsewhere"));
});
await test("a normal seed stays off the Daily board but still enters the Hall", async () => {
  const run = playOut(ed, "ZZZZ-0001");
  const rec = await verifyAndStore({ seed: "ZZZZ-0001", edition: ed.id, trail: run.trail, name: "Regular" }, NOW + 6000);
  assert.equal(rec.daily, undefined);
  assert.ok(!(await publicBoard(today)).entries.some((e) => e.name === "Regular"));
  assert.ok((await getHall(today)).entries.some((e) => e.name === "Regular"));
});

console.info("house colours");
const holder = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());
const T0 = Date.parse(today + "T09:00:00Z");
const sign = (acct: typeof holder, name: string, day = today) => acct.signMessage({ message: houseMessage(name, holder.address, day) });
const rich = async () => 5n * 10n ** 18n;
const broke = async () => 0n;
// the smart-account path asks the chain; plain-key tests say "not a smart account" so nothing touches the network
const eoa = { smartSigned: async () => false };
await test("valid signature + a balance: a claim for that name", async () => {
  const r = await checkHouse({ name: "Whale", address: holder.address, signature: await sign(holder, "Whale") }, { now: T0, balanceOf: rich, ...eoa });
  assert.equal(r.day, today);
  assert.ok(claimOk(r.claim, "whale", T0 + 1000), "claim works for the same name, any case");
  assert.ok(!claimOk(r.claim, "Minnow", T0 + 1000), "claim is tied to the name");
  assert.ok(r.expires <= Date.parse(today + "T00:00:00Z") + 86_400_000, "ends with the UTC day");
});
await test("wrong signer is refused", async () => {
  const sig = await stranger.signMessage({ message: houseMessage("Whale", holder.address, today) });
  await assert.rejects(checkHouse({ name: "Whale", address: holder.address, signature: sig }, { now: T0, balanceOf: rich, ...eoa }), (e: unknown) => e instanceof HouseError && e.status === 401);
});
await test("a signature for another name or day is refused", async () => {
  await assert.rejects(checkHouse({ name: "Whale", address: holder.address, signature: await sign(holder, "Shrimp") }, { now: T0, balanceOf: rich, ...eoa }), (e: unknown) => (e as HouseError).status === 401);
  await assert.rejects(checkHouse({ name: "Whale", address: holder.address, signature: await sign(holder, "Whale", prevDay(today)) }, { now: T0, balanceOf: rich, ...eoa }), (e: unknown) => (e as HouseError).status === 401);
});
await test("zero balance: no house colours", async () => {
  await assert.rejects(checkHouse({ name: "Whale", address: holder.address, signature: await sign(holder, "Whale") }, { now: T0, balanceOf: broke, ...eoa }), (e: unknown) => (e as HouseError).status === 403);
});
await test("chain not answering is not a zero", async () => {
  const down = async () => {
    throw new Error("timeout");
  };
  await assert.rejects(checkHouse({ name: "Whale", address: holder.address, signature: await sign(holder, "Whale") }, { now: T0, balanceOf: down, ...eoa }), (e: unknown) => (e as HouseError).status === 503);
});
await test("expired or tampered claims are worthless", () => {
  const { claim, expires } = issueClaim("Whale", T0);
  assert.ok(claimOk(claim, "Whale", T0));
  assert.ok(!claimOk(claim, "Whale", expires + 1), "expired");
  const [body, sig] = claim.split(".");
  const forgedBody = Buffer.from(JSON.stringify({ n: "whale", d: today, x: expires + 86_400_000 })).toString("base64url");
  assert.ok(!claimOk(`${forgedBody}.${sig}`, "Whale", T0), "body swapped");
  assert.ok(!claimOk(`${body}.${sig.slice(0, -2)}AA`, "Whale", T0), "signature bent");
  assert.ok(!claimOk(undefined, "Whale", T0));
});
await test("house mark rides on a run only with a valid claim for that name", async () => {
  const { claim } = issueClaim("Whale", NOW);
  const withMark = await verifyAndStore({ seed, edition: pin.edition, trail: hi.trail, name: "Whale", house: claim }, NOW + 7000);
  assert.equal(withMark.house, true);
  const wrong = await verifyAndStore({ seed, edition: pin.edition, trail: lo.trail, name: "Borrower", house: claim }, NOW + 8000);
  assert.equal(wrong.house, undefined);
  const b = await publicBoard(today);
  assert.equal(b.entries.find((e) => e.name === "Whale")?.house, true);
  assert.equal(b.entries.find((e) => e.name === "Borrower")?.house, undefined);
});
await test("the house mark changes nothing in the score", async () => {
  const { claim } = issueClaim("Twin", NOW);
  const a = await verifyAndStore({ seed, edition: pin.edition, trail: hi.trail, name: "Twin", house: claim }, NOW + 9000);
  const b = await verifyAndStore({ seed, edition: pin.edition, trail: hi.trail, name: "Twin" }, NOW + 9000);
  assert.deepEqual([a.best?.total, a.ante, a.cleared, a.won], [b.best?.total, b.ante, b.cleared, b.won]);
});

console.info("sign-in through Para");
await test("an embedded wallet's plain-key signature passes without asking the chain", async () => {
  // Para's embedded wallet hands the page a viem WalletClient; it signs personal_sign style like any key
  const embedded = privateKeyToAccount(generatePrivateKey());
  const wallet = createWalletClient({
    account: embedded,
    transport: custom({
      request: async () => {
        throw new Error("no network in tests");
      },
    }),
  });
  const message = houseMessage("Para", embedded.address, today);
  const signature = await wallet.signMessage({ account: embedded, message });
  let asked = 0;
  const r = await checkHouse(
    { name: "Para", address: embedded.address, signature },
    {
      now: T0,
      balanceOf: rich,
      smartSigned: async () => {
        asked++;
        return false;
      },
    },
  );
  assert.ok(claimOk(r.claim, "Para", T0 + 1000));
  assert.equal(asked, 0, "a recovered key never needs the chain");
});
await test("an embedded wallet with no $KICKER signs in but gets no house colours", async () => {
  const fresh = privateKeyToAccount(generatePrivateKey());
  const signature = await fresh.signMessage({ message: houseMessage("Newbie", fresh.address, today) });
  await assert.rejects(checkHouse({ name: "Newbie", address: fresh.address, signature }, { now: T0, balanceOf: broke, ...eoa }), (e: unknown) => (e as HouseError).status === 403);
});
await test("a smart account (ERC-1271) is checked on the chain and accepted", async () => {
  const account = "0x" + "ab".repeat(20);
  const owner = privateKeyToAccount(generatePrivateKey());
  const message = houseMessage("Safe", account, today);
  const signature = await owner.sign({ hash: hashMessage(message) });
  let seen: { address: string; message: string; signature: string } | null = null;
  const r = await checkHouse(
    { name: "Safe", address: account, signature },
    {
      now: T0,
      balanceOf: rich,
      smartSigned: async (address, m, sig) => {
        seen = { address, message: m, signature: sig };
        return true;
      },
    },
  );
  assert.ok(claimOk(r.claim, "Safe", T0 + 1000));
  assert.deepEqual(seen, { address: account, message, signature }, "the chain is asked about the exact house message");
});
await test("a smart account that says no is refused; a silent chain is a 503, not a no", async () => {
  const account = "0x" + "cd".repeat(20);
  const signature = await stranger.signMessage({ message: houseMessage("Safe", account, today) });
  await assert.rejects(checkHouse({ name: "Safe", address: account, signature }, { now: T0, balanceOf: rich, ...eoa }), (e: unknown) => (e as HouseError).status === 401);
  const down = async (): Promise<boolean> => {
    throw new Error("timeout");
  };
  await assert.rejects(checkHouse({ name: "Safe", address: account, signature }, { now: T0, balanceOf: rich, smartSigned: down }), (e: unknown) => (e as HouseError).status === 503);
});
await test("long smart-account signatures fit, junk does not", async () => {
  const account = "0x" + "ef".repeat(20);
  const yes = { smartSigned: async () => true };
  const r = await checkHouse({ name: "Wrapped", address: account, signature: "0x" + "11".repeat(900) }, { now: T0, balanceOf: rich, ...yes });
  assert.ok(r.claim);
  await assert.rejects(checkHouse({ name: "Wrapped", address: account, signature: "0x1234" }, { now: T0, balanceOf: rich, ...yes }), (e: unknown) => (e as HouseError).status === 400);
  await assert.rejects(checkHouse({ name: "Wrapped", address: account, signature: "0x" + "1".repeat(131) }, { now: T0, balanceOf: rich, ...yes }), (e: unknown) => (e as HouseError).status === 400);
});
await test("no Para key: sign-in is off, and says so", () => {
  const off = paraConfig({});
  assert.equal(off.available, false);
  assert.equal(off.apiKey, "");
  assert.match(off.note, /unavailable right now/);
  assert.match(off.note, /everything else plays the same/i);
  assert.equal(paraConfig({ VITE_PARA_API_KEY: "   " }).available, false, "blank is no key");
});
await test("a Para key: BETA by default, PRODUCTION only when asked", () => {
  const on = paraConfig({ VITE_PARA_API_KEY: "k" });
  assert.deepEqual([on.available, on.env, on.note], [true, "BETA", ""]);
  assert.equal(paraConfig({ VITE_PARA_API_KEY: "k", VITE_PARA_ENV: "PRODUCTION" }).env, "PRODUCTION");
  assert.equal(paraConfig({ VITE_PARA_API_KEY: "k", VITE_PARA_ENV: "production" }).env, "PRODUCTION");
  assert.equal(paraConfig({ VITE_PARA_API_KEY: "k", VITE_PARA_ENV: "SANDBOX" }).env, "BETA");
});

console.info("names, sessions and Your table");
const owner = privateKeyToAccount(generatePrivateKey());
const rival = privateKeyToAccount(generatePrivateKey());
const signInAs = async (acct: typeof owner, name: string, extra: { receipt?: string; now?: number } = {}) =>
  signIn(
    { name, address: acct.address, signature: await acct.signMessage({ message: signinMessage(name, acct.address, utcDay(new Date(extra.now ?? T0))) }), receipt: extra.receipt },
    { now: extra.now ?? T0, balanceOf: broke, ...eoa },
  );
await test("first claim wins; a second address is refused, whatever the case", async () => {
  const a = await signInAs(owner, "Gambit");
  assert.equal(a.name, "Gambit");
  assert.equal(a.holder, false);
  assert.equal(a.house, null, "no $KICKER, no house colours, still signed in");
  assert.ok(sessionOf(a.session, T0 + 1000));
  await assert.rejects(signInAs(rival, "gambit"), (e: unknown) => (e as HouseError).status === 409);
  await assert.rejects(signInAs(rival, "GAMBIT"), (e: unknown) => (e as HouseError).status === 409);
  const again = await signInAs(owner, "GaMbIt");
  assert.equal(again.name, "Gambit", "the owner signs in again under any case and keeps the claimed spelling");
});
await test("a name someone posted this week can't be grabbed, except by the device holding its receipt", async () => {
  // "Regular" was posted to today's Hall above, without signing in
  await assert.rejects(signInAs(rival, "Regular"), (e: unknown) => (e as HouseError).status === 409);
  await assert.rejects(signInAs(rival, "Regular", { receipt: "bm9wZQ" }), (e: unknown) => (e as HouseError).status === 409);
  const ok = await signInAs(rival, "Regular", { receipt: receiptFor("regular") });
  assert.equal(ok.name, "Regular");
  assert.ok(receiptOk("REGULAR", receiptFor("Regular")), "receipts are case-insensitive");
});
await test("a claimed name posts only with its owner's session", async () => {
  const s = (await signInAs(owner, "Gambit")).session;
  const run = playOut(ed, "GMBT-0001");
  await assert.rejects(verifyAndStore({ seed: "GMBT-0001", edition: ed.id, trail: run.trail, name: "Gambit" }, T0 + 100), /claimed name/);
  await assert.rejects(verifyAndStore({ seed: "GMBT-0001", edition: ed.id, trail: run.trail, name: "gambit" }, T0 + 100), /claimed name/, "case-insensitive");
  const theirs = (await signInAs(rival, "Regular", { receipt: receiptFor("Regular") })).session;
  await assert.rejects(verifyAndStore({ seed: "GMBT-0001", edition: ed.id, trail: run.trail, name: "Gambit", session: theirs }, T0 + 100), /claimed name/);
  const rec = await verifyAndStore({ seed: "GMBT-0001", edition: ed.id, trail: run.trail, name: "Gambit", session: s }, T0 + 200);
  assert.equal(rec.verified, true);
  assert.equal((await getHall(utcDay(new Date(T0)))).entries.find((e) => e.id === rec.id)?.verified, true, "the Hall shows the verified mark");
  const p = await getProfile(owner.address);
  assert.equal(p?.recent[0]?.id, rec.id, "the run follows the player");
});
await test("a forged or expired session is refused, never quietly dropped", async () => {
  const run = playOut(ed, "GMBT-0002");
  const { session, expires } = issueSession(owner.address, "Gambit", T0);
  const [body, sig] = session.split(".");
  const forged = Buffer.from(JSON.stringify({ a: rival.address.toLowerCase(), n: "gambit", d: today, x: expires })).toString("base64url") + "." + sig;
  await assert.rejects(verifyAndStore({ seed: "GMBT-0002", edition: ed.id, trail: run.trail, name: "Gambit", session: forged }, T0 + 100), /expired/);
  await assert.rejects(verifyAndStore({ seed: "GMBT-0002", edition: ed.id, trail: run.trail, name: "Gambit", session: `${body}.${sig.slice(0, -2)}AA` }, T0 + 100), /expired/);
  await assert.rejects(verifyAndStore({ seed: "GMBT-0002", edition: ed.id, trail: run.trail, name: "Gambit", session }, expires + 1), /expired/);
  await assert.rejects(verifyAndStore({ seed: "GMBT-0002", edition: ed.id, trail: run.trail, name: "Anyone", session: "junk" }, T0 + 100), /expired/, "even on an unclaimed name");
  // and with no session at all, an unclaimed name posts exactly as before
  const free = await verifyAndStore({ seed: "GMBT-0002", edition: ed.id, trail: run.trail, name: "Freebird" }, T0 + 100);
  assert.equal(free.verified, undefined);
});
await test("a session is not a house claim and a house claim is not a session", () => {
  const { session } = issueSession(owner.address, "Gambit", T0);
  assert.ok(!claimOk(session, "Gambit", T0 + 1));
  const { claim } = issueClaim("Gambit", T0);
  assert.equal(sessionOf(claim, T0 + 1), null);
});
await test("Your table: merge keeps one best per day, 30 recent runs, and the Daily streak", () => {
  let p: Profile | null = null;
  const start = Date.parse("2026-09-01T12:00:00Z");
  for (let i = 0; i < 40; i++) {
    const at = new Date(start + i * 86_400_000).toISOString();
    p = mergeProfile(p, owner.address, "Gambit", { id: "r" + i, seed: "S", edition: 1, total: 100 + i, handName: "Echo", ante: 2, won: false, at, daily: at.slice(0, 10) });
    // a weaker second run the same day changes the recent list, not the day's best
    p = mergeProfile(p, owner.address, "Gambit", { id: "w" + i, seed: "S", edition: 1, total: 1, handName: "Solo Bag", ante: 1, won: false, at: at.replace("12:00", "13:00") });
  }
  assert.equal(p!.recent.length, PROFILE_RECENT);
  assert.equal(p!.best.length, PROFILE_DAYS);
  assert.equal(p!.best[0].total, 139, "newest day first, its best hand");
  assert.ok(p!.best.every((b) => b.handName === "Echo"));
  assert.equal(p!.streak?.n, 40);
  const same = mergeProfile(p, owner.address, "Gambit", p!.recent[0]);
  assert.equal(same, p, "a run already in the record changes nothing (and costs no put)");
  const gap = mergeProfile(p, owner.address, "Gambit", { id: "late", seed: "S", edition: 1, total: 5, handName: "Echo", ante: 1, won: false, at: "2026-12-01T00:00:00Z", daily: "2026-12-01" });
  assert.deepEqual([gap.streak?.n, gap.streak?.best], [1, 40], "a skipped day restarts the streak, the best stays");
});

console.info("the cards are live");
const PER_CARD = ["maxi0", "maxi1", "maxi2", "maxi3", "pumpchaser", "dip", "early", "oldmoney", "whale", "volume", "moonboy", "snob", "airdrop", "valedictorian"];
await test("a highlight lights a card exactly when that Insider scores it", () => {
  let checked = 0;
  for (const e of [0, 1, 2]) {
    const ed2 = fakeEdition(H - 30 - e);
    const run = new Run(ed2, "LITE-000" + e);
    for (const id of PER_CARD) {
      run.s.insiders = [{ id, v: 0, paid: 0 }];
      for (const c of run.s.deck) {
        const lit = highlights(run.s.insiders, c, run.ageHours(c)).some((h) => h.id === id);
        const scored = run.score([c.id], false, false).steps.some((st) => st.kind === "insider" && st.card === c.id);
        assert.equal(lit, scored, `${id} on ${c.l.s}`);
        checked++;
      }
    }
  }
  assert.ok(checked > 2000);
});
await test("hand-level Insiders never light single cards", () => {
  const run = new Run(fakeEdition(H - 40), "LITE-0100");
  for (const id of ["echo", "sniper", "front", "copium", "index", "bag"]) for (const c of run.s.deck) assert.equal(highlights([{ id }], c, run.ageHours(c)).length, 0, id);
});
await test("the data tag reads the same numbers the engine scores", () => {
  const run = new Run(fakeEdition(H - 41), "LITE-0200");
  for (const c of run.s.deck) {
    const f = Object.fromEntries(cardFacts(c, run.ageHours(c)).lines);
    assert.equal(f["Holders"], c.l.h.toLocaleString("en-US"));
    assert.equal(f["Trades 24h"], c.l.k.toLocaleString("en-US"));
    assert.equal(f["Gift list"], c.l.d ? "yes" : "no");
    assert.ok(f["Rank"].includes((c.l.p / 100).toFixed(c.l.p < 1000 ? 1 : 0) + "%"));
    if (c.l.x !== null && c.l.x < 0) assert.match(f["Price"], /^down/);
    if (c.enh) assert.match(f["Badge"], new RegExp(ENH[c.enh].name));
  }
});
await test("the shop line only says true things, and prefers what is on offer", () => {
  for (let e = 0; e < 8; e++) {
    const run = new Run(fakeEdition(H - 50 - e), "SHOP-000" + e);
    const ageOf = (c: Card) => run.ageHours(c);
    const facts = deckFacts(run.s.deck, ageOf);
    const truth: Keyed<string, number> = {
      early: run.s.deck.filter((c) => ageOf(c) < 6).length,
      oldmoney: run.s.deck.filter((c) => ageOf(c) >= 24).length,
      dip: run.s.deck.filter((c) => c.l.x !== null && c.l.x < 0).length,
      volume: run.s.deck.filter((c) => c.l.k >= 30).length,
      whale: run.s.deck.filter((c) => c.l.h >= 17).length,
      snob: run.s.deck.filter((c) => c.l.s.length <= 3).length,
      airdrop: run.s.deck.filter((c) => c.l.d).length,
      moonboy: run.s.deck.filter((c) => c.l.p >= 5000).length,
      pumpchaser: run.s.deck.filter((c) => c.enh === "pump").length,
      potato: run.s.deck.filter((c) => c.enh === "hot").length,
    };
    for (const f of facts) {
      assert.equal(f.count, truth[f.insider], f.insider);
      assert.ok(f.count > 0);
    }
    for (const offers of [["early"], ["dip", "snob"], ["echo"], [], ["whale", "volume", "airdrop"]]) {
      const h = shopHint(run.s.deck, ageOf, offers);
      if (!h) continue;
      assert.equal(h.count, truth[h.insider]);
      assert.ok(h.text.includes(String(h.count)), "the number in the line is the count");
      assert.ok(!h.text.includes("!"));
      if (/^(Lots of red|Heavy trading|This deck is young|Old stock|Crowded tables)/.test(h.text)) assert.ok(h.count * 4 >= run.s.deck.length, "an adjective needs a quarter of the deck");
      assert.ok(!/1 cards/.test(h.text), "plural right");
      const matching = facts.filter((f) => offers.includes(f.insider));
      if (matching.length) {
        assert.ok(offers.includes(h.insider), "an Insider on offer wins");
        assert.equal(h.count, Math.max(...matching.map((f) => f.count)));
        assert.match(h.text, /likes that\.$/);
      } else assert.match(h.text, /would like that\.$/);
    }
  }
});

if (process.argv.includes("--anvil")) {
  console.info("smart account on a local anvil (port 8520, nothing leaves this machine)");
  await test("a deployed ERC-1271 account: its owner's signature passes, a stranger's does not", async () => {
    const { spawn } = await import("node:child_process");
    const { readFileSync } = await import("node:fs");
    const { createPublicClient, http, encodeAbiParameters } = await import("viem");
    const bin = process.env.ANVIL || "anvil";
    const node = spawn(bin, ["--port", "8520", "--chain-id", "46630", "--silent"], { stdio: "ignore" });
    const rpc = "http://127.0.0.1:8520";
    const saved = process.env.HOUSE_RPC;
    try {
      const pc = createPublicClient({ transport: http(rpc, { retryCount: 0 }) });
      for (let i = 0; ; i++) {
        try {
          await pc.getChainId();
          break;
        } catch (e) {
          if (i > 60) throw e;
          await new Promise((r) => setTimeout(r, 250));
        }
      }
      // anvil's first dev account deploys the test contract, on the local chain only
      const dev = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
      const owner = privateKeyToAccount(generatePrivateKey());
      const { bytecode } = JSON.parse(readFileSync(new URL("./fixtures/owned1271.json", import.meta.url), "utf8")) as { bytecode: Hex };
      const chain = { id: 46630, name: "anvil", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } } as const;
      const wc = createWalletClient({ account: dev, chain, transport: http(rpc) });
      const hash = await wc.sendTransaction({ data: (bytecode + encodeAbiParameters([{ type: "address" }], [owner.address]).slice(2)) as Hex });
      const rc = await pc.waitForTransactionReceipt({ hash });
      const account = rc.contractAddress!;
      process.env.HOUSE_RPC = rpc;
      const message = houseMessage("Vault", account, today);
      const good = await owner.sign({ hash: hashMessage(message) });
      const bad = await stranger.sign({ hash: hashMessage(message) });
      assert.equal(await smartAccountSigned(account, message, good), true);
      assert.equal(await smartAccountSigned(account, message, bad), false);
      const r = await checkHouse({ name: "Vault", address: account, signature: good }, { now: T0, balanceOf: rich });
      assert.ok(claimOk(r.claim, "Vault", T0 + 1000));
      await assert.rejects(checkHouse({ name: "Vault", address: account, signature: bad }, { now: T0, balanceOf: rich }), (e: unknown) => (e as HouseError).status === 401);
      // with the chain in reach, a plain key still passes and a plain stranger is still refused
      const plain = await holder.signMessage({ message: houseMessage("Plain", holder.address, today) });
      assert.ok((await checkHouse({ name: "Plain", address: holder.address, signature: plain }, { now: T0, balanceOf: rich })).claim);
      const wrong = await stranger.signMessage({ message: houseMessage("Plain", holder.address, today) });
      await assert.rejects(checkHouse({ name: "Plain", address: holder.address, signature: wrong }, { now: T0, balanceOf: rich }), (e: unknown) => (e as HouseError).status === 401);
    } finally {
      if (saved === undefined) delete process.env.HOUSE_RPC;
      else process.env.HOUSE_RPC = saved;
      node.kill();
    }
  });
}

if (process.argv.includes("--live")) {
  console.info("live read (Robinhood Chain testnet, eth_call only)");
  await test("the creator holds $KICKER; a fresh address holds none", async () => {
    const creator = await kickerBalance("0x16f9A7068488Fa587D9DBA01d3ef562931Ab3E52");
    assert.ok(creator > 0n, "creator balance " + creator);
    assert.equal(await kickerBalance(stranger.address), 0n);
  });
}

console.info(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
