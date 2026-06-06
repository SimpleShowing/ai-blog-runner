import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { isEmailAllowed } from "../db";
import { ENV } from "./env";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    const authed = await sdk.authenticateRequest(opts.req);
    // Enforce allowlist: owner or invited editor only
    if (authed && !authed.isCron) {
      const allowed = await isEmailAllowed(authed.email || "", authed.openId);
      user = allowed ? authed : null;
    } else {
      user = authed;
    }
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
