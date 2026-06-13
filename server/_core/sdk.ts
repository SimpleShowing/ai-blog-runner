/**
 * sdk.ts — self-hosted replacement for the Manus SDK.
 *
 * Removes all Manus OAuth/Forge dependencies.
 * Auth is now pure JWT (jose) + Google OAuth via googleOAuth.ts.
 * The public surface (sdk.authenticateRequest, sdk.createSessionToken) is unchanged.
 */
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export type SessionPayload = {
  openId: string;
  name: string;
};

export type AuthenticatedUser = User & {
  taskUid?: string;
  isCron?: boolean;
};

function getSecret(): Uint8Array {
  const secret = ENV.cookieSecret;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return new TextEncoder().encode(secret);
}

class SDKServer {
  // ── Session tokens ──────────────────────────────────────────────────────────

  async createSessionToken(
    openId: string,
    opts: { name: string; expiresInMs?: number }
  ): Promise<string> {
    const expiresInMs = opts.expiresInMs ?? ONE_YEAR_MS;
    const secret = getSecret();

    return new SignJWT({ openId, name: opts.name })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(Date.now() + expiresInMs + "ms" as any)
      .sign(secret);
  }

  async verifySession(token: string | undefined): Promise<SessionPayload | null> {
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, getSecret());
      if (typeof payload.openId !== "string") return null;
      return { openId: payload.openId, name: (payload.name as string) ?? "" };
    } catch {
      return null;
    }
  }

  // ── Request authentication ──────────────────────────────────────────────────

  async authenticateRequest(req: Request): Promise<AuthenticatedUser> {
    // Allow Railway cron requests authenticated by a shared secret header
    const cronSecret = req.headers["x-cron-secret"];
    if (cronSecret && cronSecret === process.env.CRON_SECRET) {
      return this.buildCronUser();
    }

    const cookies = parseCookieHeader(req.headers.cookie ?? "");
    const sessionCookie = cookies[COOKIE_NAME];
    const session = await this.verifySession(sessionCookie);

    if (!session) {
      throw ForbiddenError("Invalid or missing session");
    }

    const user = await db.getUserByOpenId(session.openId);
    if (!user) {
      throw ForbiddenError("User not found");
    }

    // Update last signed in (non-blocking)
    db.upsertUser({ openId: user.openId, lastSignedIn: new Date() }).catch(() => {});

    return user;
  }

  // ── Cron user ───────────────────────────────────────────────────────────────

  private buildCronUser(): AuthenticatedUser {
    const now = new Date();
    return {
      id: -1,
      openId: "cron_railway",
      name: "Railway Cron",
      email: null,
      loginMethod: null,
      role: "user",
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
      isCron: true,
    } as AuthenticatedUser;
  }

  // ── Stubs for callers that reference old Manus SDK methods ─────────────────
  // These are no-ops now but prevent TypeScript errors in files we haven't touched.

  async exchangeCodeForToken(_code: string, _state: string): Promise<{ accessToken: string }> {
    throw new Error("Use /api/auth/google OAuth flow instead");
  }

  async getUserInfo(_token: { accessToken: string }): Promise<{ openId: string; name: string; email: string }> {
    throw new Error("Use /api/auth/google OAuth flow instead");
  }
}

export const sdk = new SDKServer();
