// Sign-in settings, read from the build env. Pure, so `npm test` can check the no-key state.
export type ParaEnvName = "BETA" | "PRODUCTION";

export interface ParaSettings {
  available: boolean;
  apiKey: string;
  env: ParaEnvName;
  /** What the sign-in button says when there is no key. */
  note: string;
}

export const SIGNIN_OFF = "Sign-in is unavailable right now. Everything else plays the same.";

export function paraConfig(env: { VITE_PARA_API_KEY?: string; VITE_PARA_ENV?: string }): ParaSettings {
  const apiKey = (env.VITE_PARA_API_KEY || "").trim();
  const name: ParaEnvName = (env.VITE_PARA_ENV || "").trim().toUpperCase() === "PRODUCTION" ? "PRODUCTION" : "BETA";
  return { available: !!apiKey, apiKey, env: name, note: apiKey ? "" : SIGNIN_OFF };
}
