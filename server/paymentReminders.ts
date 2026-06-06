/**
 * Payment reminder scheduled handler.
 * Called by Manus Heartbeat cron at day 3, 5, and 7 after publication.
 * Payload: { submissionId: number, dayNumber: 3 | 5 | 7 }
 *
 * Day 7: also unpublishes the WP post (sets status to draft) if still unpaid.
 */
import { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { partnerSubmissions } from "../drizzle/schema";
import { sdk } from "./_core/sdk";
import {
  sendPartnerPaymentReminder,
  sendPartnerRemovedUnpaid,
} from "./email";
import { getSetting } from "./db";

// ─── WP helper: set post to draft ────────────────────────────────────────────

async function setWpPostToDraft(
  wpPostId: number,
  wpUrl: string,
  wpUser: string,
  wpPass: string
): Promise<void> {
  const url = `${wpUrl.replace(/\/$/, "")}/wp-json/wp/v2/posts/${wpPostId}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${wpUser}:${wpPass}`).toString("base64")}`,
    },
    body: JSON.stringify({ status: "draft" }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WP set-draft failed (${res.status}): ${text}`);
  }
}

// ─── WP helper: restore post to publish ──────────────────────────────────────

export async function setWpPostToPublish(
  wpPostId: number,
  wpUrl: string,
  wpUser: string,
  wpPass: string
): Promise<void> {
  const url = `${wpUrl.replace(/\/$/, "")}/wp-json/wp/v2/posts/${wpPostId}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${wpUser}:${wpPass}`).toString("base64")}`,
    },
    body: JSON.stringify({ status: "publish" }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WP restore-publish failed (${res.status}): ${text}`);
  }
}

// ─── Scheduled handler ────────────────────────────────────────────────────────

export async function paymentReminderHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    // Look up submission by task UID (which column depends on dayNumber in payload)
    // We search all three columns to find the matching submission
    const taskUid = user.taskUid;

    const [submission] = await db
      .select()
      .from(partnerSubmissions)
      .where(
        eq(partnerSubmissions.reminderDay3TaskUid, taskUid)
      )
      .limit(1)
      .then(async (rows) => {
        if (rows.length) return rows;
        return db
          .select()
          .from(partnerSubmissions)
          .where(eq(partnerSubmissions.reminderDay5TaskUid, taskUid))
          .limit(1);
      })
      .then(async (rows) => {
        if (rows.length) return rows;
        return db
          .select()
          .from(partnerSubmissions)
          .where(eq(partnerSubmissions.reminderDay7TaskUid, taskUid))
          .limit(1);
      });

    if (!submission) {
      return res.json({ ok: true, skipped: "orphan" });
    }

    // Already paid — nothing to do
    if (submission.paymentStatus === "paid") {
      return res.json({ ok: true, skipped: "already_paid" });
    }

    // Grace extended — skip this reminder
    if (submission.paymentGraceExtended) {
      return res.json({ ok: true, skipped: "grace_extended" });
    }

    // Determine which day this is
    let dayNumber: 3 | 5 | 7 = 3;
    if (submission.reminderDay5TaskUid === taskUid) dayNumber = 5;
    if (submission.reminderDay7TaskUid === taskUid) dayNumber = 7;

    const paymentLinkUrl = submission.stripePaymentLinkUrl ?? "";
    const wpPostUrl = submission.wpPostUrl ?? "";
    const amountCents = submission.amountCents ?? 0;

    if (dayNumber === 7) {
      // Unpublish the WP post
      if (submission.wpPostId) {
        try {
          const wpUrl = await getSetting("wp_url");
          const wpUser = await getSetting("wp_username");
          const wpPass = await getSetting("wp_app_password");
          if (wpUrl && wpUser && wpPass) {
            await setWpPostToDraft(submission.wpPostId, wpUrl, wpUser, wpPass);
          }
        } catch (wpErr) {
          console.error("[paymentReminder] WP unpublish failed:", wpErr);
        }
      }

      // Update status to reflect removal
      await db
        .update(partnerSubmissions)
        .set({ status: "pending" }) // revert to pending so it shows in queue
        .where(eq(partnerSubmissions.id, submission.id));

      // Send removal email
      await sendPartnerRemovedUnpaid({
        to: submission.partnerEmail,
        partnerName: submission.partnerName,
        articleTitle: submission.title,
        amountCents,
        paymentLinkUrl,
      });
    } else {
      // Send reminder email (day 3 or 5)
      await sendPartnerPaymentReminder({
        to: submission.partnerEmail,
        partnerName: submission.partnerName,
        articleTitle: submission.title,
        amountCents,
        wpPostUrl,
        paymentLinkUrl,
        dayNumber,
      });
    }

    return res.json({ ok: true, dayNumber, submissionId: submission.id });
  } catch (err) {
    console.error("[paymentReminder] Handler error:", err);
    return res.status(500).json({
      error: String(err),
      timestamp: new Date().toISOString(),
    });
  }
}
