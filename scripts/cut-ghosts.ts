// Cuts a fresh squad snapshot from the live index (nothing stored) and reports the Haunted table's ghosts.
// `npx tsx scripts/cut-ghosts.ts [out.json]`
import { writeFileSync } from "node:fs";
import { cutEdition } from "../api/_cut.js";
import { editionNow } from "../shared/data.js";

delete process.env.BLOB_READ_WRITE_TOKEN;
const ed = await cutEdition(editionNow(), Date.now() + 90000);
const all = ed.pool.flat();
console.info(
  `cut ${ed.id}: scanned ${ed.scanned}, dropped ${ed.dropped}, listed ${all.length}, 0-trade on the list ${all.filter((l) => l.k === 0).length}, ghosts kept aside ${ed.ghosts?.length || 0}`,
);
for (const g of (ed.ghosts || []).slice(0, 5)) console.info(`  $${g.s} holders ${g.h} trades ${g.k}`);
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(ed));
