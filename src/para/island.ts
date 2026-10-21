// The sign-in island: Para's modal and signer, in real React, loaded only when a player opens sign-in
// (or warms the button). Email, Google, X, Discord and browser wallets all go through Para's modal;
// this file never talks to a wallet itself. The rest of the page is Preact and never imports this.
import { createElement as h, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// The provider and modal come from the SDK's core entry (@getpara/react-sdk re-exports it), and the viem hook from
// its EVM entry: the root entry would also pull every smart-account and non-EVM integration into the bundle.
import { Environment, ParaProvider, useLogout, useModal } from "@getpara/react-sdk-lite";
import { useParaViemClient } from "@getpara/react-sdk/evm/hooks";
import "@getpara/react-sdk/styles.css";
import { http } from "viem";
import { robinhoodTestnet } from "../../shared/chain.js";

export interface IslandOptions {
  apiKey: string;
  env: "BETA" | "PRODUCTION";
  onAddress(address: string | null): void;
}

export interface Island {
  open(): void;
  signOut(): Promise<void>;
  /** Signs a plain text message with whatever wallet the player signed in with. No transaction. */
  sign(message: string): Promise<{ address: string; signature: string }>;
  address(): string | null;
  /** The signed-in address once Para has settled (or null), waiting a few seconds at most. */
  settled(): Promise<string | null>;
}

interface Api {
  settled?: boolean;
  open?: () => void;
  logout?: () => Promise<unknown>;
  client?: { account?: { address: string }; signMessage: (a: { account: never; message: string }) => Promise<string> } | null;
}

const transport = http(robinhoodTestnet.rpcUrls.default.http[0]);
// Para looks the chain's logo up by name; "Robinhood Chain" has one, the testnet name 404s on every open.
// Same chain id, RPC and testnet flag: only the label inside Para's modal is shorter.
const chain = { ...robinhoodTestnet, name: "Robinhood Chain" };

function Bridge(props: { api: Api; onAddress: (a: string | null) => void; ready: () => void }) {
  const { openModal } = useModal();
  const { logoutAsync } = useLogout();
  const { viemClient } = useParaViemClient({ walletClientConfig: { chain, transport } });
  const address = viemClient?.account?.address?.toLowerCase() || null;
  const last = useRef<string | null | undefined>(undefined);
  props.api.open = () => openModal();
  props.api.logout = () => logoutAsync();
  props.api.client = (viemClient as unknown as Api["client"]) || null;
  useEffect(() => props.ready(), []);
  useEffect(() => {
    // wait for Para to settle before reporting "nobody", so a reload doesn't flash a sign-out
    if (viemClient === undefined) return;
    props.api.settled = true;
    if (last.current === address) return;
    last.current = address;
    props.onAddress(address);
  }, [address, viemClient]);
  return null;
}

export function mount(opts: IslandOptions): Promise<Island> {
  const host = document.createElement("div");
  host.id = "para-island";
  document.body.appendChild(host);
  const api: Api = {};
  const queryClient = new QueryClient();
  let current: string | null = null;
  return new Promise((resolve) => {
    const ready = () =>
      resolve({
        open: () => api.open?.(),
        signOut: async () => {
          await api.logout?.();
        },
        async sign(message) {
          const c = api.client;
          const address = c?.account?.address;
          if (!c || !address) throw new Error("Sign in first");
          const signature = await c.signMessage({ account: c.account as never, message });
          return { address: address.toLowerCase(), signature };
        },
        address: () => current,
        async settled() {
          for (let i = 0; i < 40 && !api.settled; i++) await new Promise((r) => setTimeout(r, 200));
          return current;
        },
      });
    createRoot(host).render(
      h(
        QueryClientProvider,
        { client: queryClient },
        h(
          ParaProvider,
          {
            paraClientConfig: { apiKey: opts.apiKey, env: opts.env === "PRODUCTION" ? Environment.PRODUCTION : Environment.BETA },
            config: { appName: "KICKER" },
            externalWalletConfig: {
              // browser wallets through Para's own connectors (wagmi inside Para); no WalletConnect without a project id
              wallets: ["METAMASK", "COINBASE", "RAINBOW", "RABBY", "ZERION", "OKX"],
              evmConnector: { config: { chains: [chain], transports: { [chain.id]: transport } } },
            },
            paraModalConfig: {
              oAuthMethods: ["GOOGLE", "TWITTER", "DISCORD"],
              disableEmailLogin: false,
              disablePhoneLogin: true,
              authLayout: ["AUTH:FULL", "EXTERNAL:FULL"],
              recoverySecretStepEnabled: false,
              onRampTestMode: true,
              theme: {
                mode: "dark",
                foregroundColor: "#ffe9c7",
                backgroundColor: "#1a0816",
                accentColor: "#ffc23d",
                borderRadius: "md",
                font: "inherit",
              },
            },
            waitForReady: false,
          } as never,
          h(Bridge, {
            api,
            ready,
            onAddress(a: string | null) {
              current = a;
              opts.onAddress(a);
            },
          }),
        ),
      ),
    );
  });
}
