import type { CookieOptions, Request } from "express";
import { ENV } from "./env";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string | undefined) {
  if (!host) return false;
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isLocalRequest(req: Request) {
  const hostname = req.hostname;
  return !hostname || LOCAL_HOSTS.has(hostname) || isIpAddress(hostname);
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  // In production (Cloud Run / any reverse proxy), always mark the cookie as
  // Secure so that SameSite=Lax is accepted by all browsers.
  // In local dev the request is plain HTTP so we skip the Secure flag.
  const isLocal = isLocalRequest(req);
  const secure = ENV.isProduction ? true : !isLocal;

  return {
    httpOnly: true,
    path: "/",
    // Use Lax for same-site OAuth redirects (the callback is a top-level
    // navigation, so Lax is sufficient and more compatible than None).
    sameSite: "lax",
    secure,
  };
}
