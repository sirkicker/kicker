// The table's API, from the browser.
import type { PublicMan } from "../../shared/side.js";

export interface DayRod {
  day: string;
  kits: [string, string][];
  count: number;
  men: PublicMan[];
}
export interface Rods {
  today: string;
  first: string;
  days: DayRod[];
}
export interface LaunchLook {
  token: string;
  name: string;
  symbol: string;
  pal: string[];
  badge: { sym: string; px: string };
}

async function get<T>(q: string): Promise<T> {
  let r: Response;
  try {
    r = await fetch("/api/side?" + q);
  } catch {
    throw new Error("no connection. try again");
  }
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error || `the table did not answer (${r.status})`);
  return j;
}

export const api = {
  rods: (to = "", n = 6) => get<Rods>(`rods=${encodeURIComponent(to)}&n=${n}`),
  motd: () => get<{ day: string; from: string | null; man: PublicMan | null }>("motd="),
  man: (id: string) => get<{ man: PublicMan }>(`man=${encodeURIComponent(id)}`),
  token: (link: string) => get<LaunchLook>(`token=${encodeURIComponent(link)}`),
  holder: (addr: string) => get<{ holder: boolean | null }>(`holder=${encodeURIComponent(addr)}`),
  album: () => get<{ size: number; fielded: Record<string, { id: string; day: string; name: string }> }>("album=1"),
  async put(body: object): Promise<{ man: PublicMan; today: string }> {
    let r: Response;
    try {
      r = await fetch("/api/side", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "put", ...body }) });
    } catch {
      throw new Error("no connection. he is still here, try again");
    }
    const j = (await r.json().catch(() => ({}))) as { man: PublicMan; today: string; error?: string };
    if (!r.ok) throw new Error(j.error || `the table did not answer (${r.status})`);
    return j;
  },
};
export const portraitUrl = (id: string) => `/api/side?img=portrait&id=${encodeURIComponent(id)}`;
