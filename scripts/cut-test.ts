import { writeFileSync } from "node:fs";
import { cutEdition } from "../api/_cut.js";
import { editionNow } from "../shared/data.js";
const t0 = Date.now();
const ed = await cutEdition(editionNow());
console.info("ms", Date.now() - t0, "scanned", ed.scanned, "dropped", ed.dropped, "pair kinds", ed.pool.map((s) => s.length), "bytes", JSON.stringify(ed).length);
writeFileSync("scripts/edition.json", JSON.stringify(ed));
for (const s of ed.pool) console.info(s.slice(0, 6).map((c) => `${c.s}/${c.q} p${c.p} k${c.k} h${c.h}`).join(" | "));
