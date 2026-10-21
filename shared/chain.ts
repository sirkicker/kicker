// Robinhood Chain testnet as a viem chain. Used by the sign-in island and by the server's smart-account check.
import { defineChain } from "viem";
import { HOUSE_CHAIN } from "./house.js";

export const robinhoodTestnet = defineChain({
  id: HOUSE_CHAIN.id,
  name: HOUSE_CHAIN.name,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [HOUSE_CHAIN.rpc] } },
  blockExplorers: { default: { name: "Explorer", url: HOUSE_CHAIN.explorer } },
  testnet: true,
});
