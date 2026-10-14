// Unit tests for 1.1: the Daily Deal seed and deck pin, the Daily board, and the house-colours checks.
// Runs on the in-memory store, no network: `npm test`. Add `--live` to also read $KICKER balances on Robinhood Chain testnet.
import assert from "node:assert/strict";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Edition, PoolCard, Suit } from "../shared/data.js";
import { Run, encodeTrail } from "../shared/engine.js";
import { botStep } from "../shared/bot.js";
import { mulberry32, normSeed } from "../shared/rng.js";
import { bumpStreak, dailySeed, dayLabel, dayStartHour, liveStreak, prevDay, utcDay } from "../shared/daily.js";
import { houseMessage } from "../shared/house.js";
import { save } from "../api/_store.js";
import { dailyPin, publicBoard } from "../api/_daily.js";
import { verifyAndStore, getHall } from "../api/_runs.js";
import { checkHouse, claimOk, issueClaim, kickerBalance, HouseError } from "../api/_house.js";

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
await test("valid signature + a balance: a claim for that name", async () => {
  const r = await checkHouse({ name: "Whale", address: holder.address, signature: await sign(holder, "Whale") }, { now: T0, balanceOf: rich });
  assert.equal(r.day, today);
  assert.ok(claimOk(r.claim, "whale", T0 + 1000), "claim works for the same name, any case");
  assert.ok(!claimOk(r.claim, "Minnow", T0 + 1000), "claim is tied to the name");
  assert.ok(r.expires <= Date.parse(today + "T00:00:00Z") + 86_400_000, "ends with the UTC day");
});
await test("wrong signer is refused", async () => {
  const sig = await stranger.signMessage({ message: houseMessage("Whale", holder.address, today) });
  await assert.rejects(checkHouse({ name: "Whale", address: holder.address, signature: sig }, { now: T0, balanceOf: rich }), (e: unknown) => e instanceof HouseError && e.status === 401);
});
await test("a signature for another name or day is refused", async () => {
  await assert.rejects(checkHouse({ name: "Whale", address: holder.address, signature: await sign(holder, "Shrimp") }, { now: T0, balanceOf: rich }), (e: unknown) => (e as HouseError).status === 401);
  await assert.rejects(checkHouse({ name: "Whale", address: holder.address, signature: await sign(holder, "Whale", prevDay(today)) }, { now: T0, balanceOf: rich }), (e: unknown) => (e as HouseError).status === 401);
});
await test("zero balance: no house colours", async () => {
  await assert.rejects(checkHouse({ name: "Whale", address: holder.address, signature: await sign(holder, "Whale") }, { now: T0, balanceOf: broke }), (e: unknown) => (e as HouseError).status === 403);
});
await test("chain not answering is not a zero", async () => {
  const down = async () => {
    throw new Error("timeout");
  };
  await assert.rejects(checkHouse({ name: "Whale", address: holder.address, signature: await sign(holder, "Whale") }, { now: T0, balanceOf: down }), (e: unknown) => (e as HouseError).status === 503);
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
