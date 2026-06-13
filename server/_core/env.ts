export const ENV = {
  // App
  cookieSecret: process.env.JWT_SECRET ?? "",
  isProduction: process.env.NODE_ENV === "production",

  // Database (Supabase Postgres)
  databaseUrl: process.env.DATABASE_URL ?? "",

  // Google OAuth
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",

  // Owner identity (your Google account's "sub" claim — set after first login)
  ownerEmail: process.env.OWNER_EMAIL ?? "",

  // Anthropic (replaces Forge/Gemini for both generation + refresh)
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",

  // External services (unchanged)
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",

  // Legacy Manus fields — kept as empty stubs so nothing breaks at import time.
  // The cron system now uses Railway's built-in cron instead of Heartbeat.
  appId: "",
  oAuthServerUrl: "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  forgeApiUrl: "",
  forgeApiKey: "",
};
