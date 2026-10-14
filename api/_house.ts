// House colours: a $KICKER holder signs a plain message, the server checks the signature and the balance,
// then hands back a short-lived claim tied to the player's name for the UTC day. Cosmetic only:
// nothing here is read by the engine, the deal, the shop or the score.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { verifyMessage } from "viem";
import { GAME_TOKEN } from "../shared/data.js";
import { utcDay } from "../shared/daily.js";
import { ADDRESS_RE, HOUSE_CHAIN, houseMessage } from "../shared/house.js";
import { cleanName, nameProblem } from "../shared/names.js";

// The claim key: its own secret if set, else derived from the store token the deploy already has.
let devKey: Buffer | null = null;
function key(): Buffer {
  const own = process.env.HOUSE_SECRET;
  if (own) return Buffer.from("house|" + own);
  const blob = process.env.BLOB_READ_WRITE_TOKEN;
  if (blob) return createHmac("sha256", "kicker house colours").update(blob).digest();
  return (devKey ||= randomBytes(32));
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const mac = (body: string) => createHmac("sha256", key()).update(body).digest();

export interface Claim {
  n: string; // name, lowercase
  d: string; // UTC day
  x: number; // expires, unix ms
}

/** End of the UTC day, and never more than 12 hours out. */
const expiry = (now: number) => Math.min(Date.parse(utcDay(new Date(now)) + "T00:00:00Z") + 86_400_000, now + 12 * 3_600_000);

export function issueClaim(name: string, now = Date.now()): { claim: string; expires: number; day: string } {
  const c: Claim = { n: cleanName(name).toLowerCase(), d: utcDay(new Date(now)), x: expiry(now) };
  const body = b64(JSON.stringify(c));
  return { claim: `${body}.${b64(mac(body))}`, expires: c.x, day: c.d };
}

/** True when the claim is ours, unexpired and made for this name. */
export function claimOk(claim: unknown, name: string | null, now = Date.now()): boolean {
  if (typeof claim !== "string" || claim.length > 400 || !name) return false;
  const [body, sig] = claim.split(".");
  if (!body || !sig) return false;
  const want = mac(body);
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return false;
  try {
    const c = JSON.parse(Buffer.from(body, "base64url").toString()) as Claim;
    return typeof c.x === "number" && c.x > now && c.n === cleanName(name).toLowerCase();
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ the onchain read
/** balanceOf(address) on the game's own token, read from the testnet RPC. A read call, nothing is sent. */
export async function kickerBalance(address: string): Promise<bigint> {
  const rpc = process.env.HOUSE_RPC || HOUSE_CHAIN.rpc;
  const data = "0x70a08231" + address.toLowerCase().slice(2).padStart(64, "0");
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: GAME_TOKEN.address, data }, "latest"] }),
    signal: AbortSignal.timeout(8000),
  });
  const j = (await res.json()) as { result?: string; error?: { message?: string } };
  if (!res.ok || typeof j.result !== "string" || !/^0x[0-9a-f]*$/i.test(j.result)) throw new Error("the chain is not answering");
  return j.result === "0x" ? 0n : BigInt(j.result);
}

export class HouseError extends Error {
  constructor(
    msg: string,
    public status: number,
  ) {
    super(msg);
  }
}

/** Checks a signed house request; returns a claim for the day or throws a HouseError. */
export async function checkHouse(
  input: { name?: unknown; address?: unknown; signature?: unknown },
  opts: { now?: number; balanceOf?: (a: string) => Promise<bigint> } = {},
): Promise<{ claim: string; expires: number; day: string; name: string }> {
  const now = opts.now ?? Date.now();
  const name = cleanName(typeof input.name === "string" ? input.name : "");
  const problem = nameProblem(name);
  if (problem) throw new HouseError(problem, 400);
  const address = typeof input.address === "string" ? input.address : "";
  if (!ADDRESS_RE.test(address)) throw new HouseError("bad address", 400);
  const signature = typeof input.signature === "string" ? input.signature : "";
  if (!/^0x[0-9a-fA-F]{130,}$/.test(signature) || signature.length > 2000) throw new HouseError("bad signature", 400);
  const message = houseMessage(name, address, utcDay(new Date(now)));
  let good = false;
  try {
    good = await verifyMessage({ address: address as `0x${string}`, message, signature: signature as `0x${string}` });
  } catch {
    good = false;
  }
  if (!good) throw new HouseError("The signature does not match that address (or it was signed for another day)", 401);
  let bal: bigint;
  try {
    bal = await (opts.balanceOf || kickerBalance)(address);
  } catch {
    throw new HouseError("Robinhood Chain testnet is not answering. Try again in a minute.", 503);
  }
  if (bal <= 0n) throw new HouseError("No $KICKER on that address, so no house colours. Everything else plays the same.", 403);
  return { ...issueClaim(name, now), name };
}
