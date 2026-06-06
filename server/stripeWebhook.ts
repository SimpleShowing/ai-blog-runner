import { Request, Response } from "express";
import { stripe } from "./stripe";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { partnerSubmissions } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { sendPartnerPaymentReceived } from "./email";

export async function stripeWebhookHandler(req: Request, res: Response) {
  const sig = req.headers["stripe-signature"];
  if (!sig) return res.status(400).json({ error: "Missing stripe-signature" });

  let event: ReturnType<typeof stripe.webhooks.constructEvent>;

  try {
    event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      sig,
      ENV.stripeWebhookSecret
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Stripe Webhook] Signature verification failed:", msg);
    return res.status(400).json({ error: `Webhook Error: ${msg}` });
  }

  // Test event passthrough (required by Stripe integration spec)
  if (event.id.startsWith("evt_test_")) {
    console.log("[Stripe Webhook] Test event detected, returning verification response");
    return res.json({ verified: true });
  }

  console.log(`[Stripe Webhook] Received event: ${event.type} (${event.id})`);

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as {
        id: string;
        metadata?: Record<string, string>;
        customer_email?: string | null;
        payment_status?: string;
      };

      const submissionId = session.metadata?.submission_id
        ? parseInt(session.metadata.submission_id, 10)
        : null;

      if (!submissionId || isNaN(submissionId)) {
        console.warn("[Stripe Webhook] No submission_id in metadata, skipping");
        return res.json({ ok: true, skipped: "no_submission_id" });
      }

      const db = await getDb();
      if (!db) return res.status(500).json({ error: "DB unavailable" });
      const [submission] = await db
        .select()
        .from(partnerSubmissions)
        .where(eq(partnerSubmissions.id, submissionId))
        .limit(1);

      if (!submission) {
        console.warn(`[Stripe Webhook] Submission ${submissionId} not found`);
        return res.json({ ok: true, skipped: "submission_not_found" });
      }

      // Already paid — idempotent
      if (submission.paymentStatus === "paid") {
        return res.json({ ok: true, skipped: "already_paid" });
      }

      await db
        .update(partnerSubmissions)
        .set({
          paymentStatus: "paid",
          stripeSessionId: session.id,
          paidAt: new Date(),
        })
        .where(eq(partnerSubmissions.id, submissionId));

      // Send payment received confirmation email
      try {
        await sendPartnerPaymentReceived({
          to: submission.partnerEmail,
          partnerName: submission.partnerName,
          articleTitle: submission.title,
          amountCents: submission.amountCents ?? 0,
          wpPostUrl: submission.wpPostUrl ?? "",
        });
      } catch (emailErr) {
        console.error("[Stripe Webhook] Failed to send payment confirmation email:", emailErr);
      }

      console.log(`[Stripe Webhook] Marked submission ${submissionId} as paid`);
    }
  } catch (err) {
    console.error("[Stripe Webhook] Handler error:", err);
    return res.status(500).json({ error: "Internal handler error" });
  }

  return res.json({ ok: true });
}
