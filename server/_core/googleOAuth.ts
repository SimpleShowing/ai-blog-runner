/**
 * Google OAuth 2.0 authentication routes.
 * Replaces the Manus OAuth flow with standard Google Sign-In.
 *
 * Flow:
 *   1. GET /api/auth/google          → redirect to Google consent screen
 *   2. GET /api/auth/callback/google → exchange code, set session cookie, redirect to /
 */
import type { Express, Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { ENV } from "./env";
import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const";

function getRedirectUri(req: Request): string {
  // Always derive the redirect URI from the incoming request so it works on
  // both the dev preview URL and the published domain.
  const proto = ENV.isProduction ? "https" : req.protocol;
  const host = req.get("host") ?? "localhost:3000";
  return `${proto}://${host}/api/auth/callback/google`;
}

export function registerGoogleOAuthRoutes(app: Express) {
  // ── Step 1: Initiate Google OAuth ──────────────────────────────────────────
  app.get("/api/auth/google", (req: Request, res: Response) => {
    const redirectUri = getRedirectUri(req);
    const client = new OAuth2Client(ENV.googleClientId, ENV.googleClientSecret, redirectUri);

    const authUrl = client.generateAuthUrl({
      access_type: "offline",
      scope: ["openid", "email", "profile"],
      prompt: "select_account",
    });

    res.redirect(302, authUrl);
  });

  // ── Step 2: Handle Google callback ────────────────────────────────────────
  app.get("/api/auth/callback/google", async (req: Request, res: Response) => {
    const code = req.query["code"];
    const error = req.query["error"];

    if (error) {
      console.error("[Google OAuth] Error from Google:", error);
      res.redirect(302, "/login?error=oauth_denied");
      return;
    }

    if (!code || typeof code !== "string") {
      res.status(400).json({ error: "Missing authorization code" });
      return;
    }

    try {
      const redirectUri = getRedirectUri(req);
      const client = new OAuth2Client(ENV.googleClientId, ENV.googleClientSecret, redirectUri);

      // Exchange code for tokens
      const { tokens } = await client.getToken(code);
      if (!tokens.id_token) {
        res.status(400).json({ error: "No id_token in response" });
        return;
      }

      // Verify the ID token and extract user info
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: ENV.googleClientId,
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.sub) {
        res.status(400).json({ error: "Invalid Google token payload" });
        return;
      }

      const openId = `google:${payload.sub}`;
      const email = payload.email ?? null;
      const name = payload.name ?? payload.email ?? "Google User";

      // Upsert user in database
      await db.upsertUser({
        openId,
        name,
        email,
        loginMethod: "google",
        lastSignedIn: new Date(),
      });

      // Create a session JWT using the existing SDK helper
      const sessionToken = await sdk.createSessionToken(openId, {
        name,
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (err) {
      console.error("[Google OAuth] Callback failed:", err);
      res.redirect(302, "/login?error=oauth_failed");
    }
  });
}
