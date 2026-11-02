// The Haunted table event on the page: whether it is live (or forced on with ?haunt=preview for QA), and the
// cosmetic Haunted kit badge a device keeps after winning a Haunted match during the event.
import { HAUNT, hauntLive } from "../shared/content.js";
import { local } from "./store.js";

const preview = typeof location !== "undefined" && new URLSearchParams(location.search).get("haunt") === "preview";

/** True while the event runs, or with ?haunt=preview. */
export const hauntOn = (now = Date.now()) => preview || hauntLive(now);
export const hauntPreview = () => preview;

/** The day this device won the Haunted kit, or null. Cosmetic only. */
export const hauntKit = () => local.get<string | null>("kk.hauntKit", null);
export function gainHauntKit(now = Date.now()) {
  if (!hauntOn(now) || hauntKit()) return false;
  local.set("kk.hauntKit", new Date(now).toISOString().slice(0, 10));
  return true;
}
export const HAUNT_UNTIL = `through ${HAUNT.endLabel}`;
