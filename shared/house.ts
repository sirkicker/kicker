// House colours: the message a $KICKER holder signs, shared by the page and the server so both build it the same way.
export const HOUSE_CHAIN = { id: 46630, hex: "0xb626", name: "Robinhood Chain testnet", rpc: "https://rpc.testnet.chain.robinhood.com" };

/** Plain text, no gas, no transaction. The day keeps an old signature from being reused tomorrow. */
export function houseMessage(name: string, address: string, day: string): string {
  return [
    "KICKER house colours",
    "",
    `Name: ${name}`,
    `Address: ${address.toLowerCase()}`,
    `Day: ${day} (UTC)`,
    "",
    "This only proves the address holds $KICKER on Robinhood Chain testnet.",
    "Signing costs nothing and moves nothing. Cosmetic only.",
  ].join("\n");
}

export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
