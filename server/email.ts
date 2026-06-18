/**
 * Transactional email helpers for partner notifications via Resend.
 * All functions are fire-and-forget safe — they catch errors internally
 * so a failed email never breaks the calling mutation.
 */
import { Resend } from "resend";
import { ENV } from "./_core/env";

const FROM = "SimpleShowing <hello@simpleshowing.com>";

function getResend(): Resend | null {
  if (!ENV.resendApiKey) return null;
  return new Resend(ENV.resendApiKey);
}

/** Confirmation email sent immediately after a partner submits content. */
export async function sendPartnerSubmissionReceived(opts: {
  to: string;
  partnerName: string;
  title: string;
  referenceId: number;
}): Promise<void> {
  try {
    const resend = getResend();
    if (!resend) return;
    await resend.emails.send({
      from: FROM,
      to: opts.to,
      subject: `We received your submission: "${opts.title}"`,
      html: `
        <p>Hi ${opts.partnerName},</p>
        <p>Thanks for submitting your content to SimpleShowing! We've received your article and our editorial team will review it shortly.</p>
        <p><strong>Submission details:</strong><br/>
        Title: ${opts.title}<br/>
        Reference ID: #${opts.referenceId}</p>
        <p>We'll be in touch once the review is complete. In the meantime, feel free to reply to this email if you have any questions.</p>
        <p>Best,<br/>The SimpleShowing Team</p>
      `,
    });
  } catch (err) {
    console.error("[email] sendPartnerSubmissionReceived failed:", err);
  }
}

/** Approval email sent when an admin approves a partner submission. */
export async function sendPartnerApproved(opts: {
  to: string;
  partnerName: string;
  title: string;
  referenceId: number;
}): Promise<void> {
  try {
    const resend = getResend();
    if (!resend) return;
    await resend.emails.send({
      from: FROM,
      to: opts.to,
      subject: `Your submission has been approved: "${opts.title}"`,
      html: `
        <p>Hi ${opts.partnerName},</p>
        <p>Great news! Your article submission has been reviewed and <strong>approved</strong> by our editorial team.</p>
        <p><strong>Article:</strong> ${opts.title}<br/>
        <strong>Reference ID:</strong> #${opts.referenceId}</p>
        <p>We'll be publishing it to the SimpleShowing blog shortly. We'll send you another email with the live link once it's live.</p>
        <p>Thank you for contributing to SimpleShowing!</p>
        <p>Best,<br/>The SimpleShowing Team</p>
      `,
    });
  } catch (err) {
    console.error("[email] sendPartnerApproved failed:", err);
  }
}

/** Rejection email sent when an admin rejects a partner submission, including the review reason. */
export async function sendPartnerRejected(opts: {
  to: string;
  partnerName: string;
  title: string;
  referenceId: number;
  reason: string;
}): Promise<void> {
  try {
    const resend = getResend();
    if (!resend) return;
    await resend.emails.send({
      from: FROM,
      to: opts.to,
      subject: `Update on your submission: "${opts.title}"`,
      html: `
        <p>Hi ${opts.partnerName},</p>
        <p>Thank you for submitting your content to SimpleShowing. After careful review, we're unable to accept this submission at this time.</p>
        <p><strong>Article:</strong> ${opts.title}<br/>
        <strong>Reference ID:</strong> #${opts.referenceId}</p>
        <p><strong>Reviewer notes:</strong><br/>${opts.reason}</p>
        <p>If you'd like to revise and resubmit, or if you have any questions, please reply to this email and we'll be happy to help.</p>
        <p>Best,<br/>The SimpleShowing Team</p>
      `,
    });
  } catch (err) {
    console.error("[email] sendPartnerRejected failed:", err);
  }
}

/** Published email sent when the article goes live on WordPress. Includes payment link if provided. */
export async function sendPartnerPublished(opts: {
  to: string;
  partnerName: string;
  title: string;
  referenceId: number;
  wpPostUrl: string;
  paymentLinkUrl?: string;
  amountCents?: number;
}): Promise<void> {
  try {
    const resend = getResend();
    if (!resend) return;
    const amount = opts.amountCents ? `$${(opts.amountCents / 100).toFixed(2)}` : null;
    const paymentSection = opts.paymentLinkUrl && amount
      ? `
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb"/>
        <p><strong>Payment due: ${amount}</strong></p>
        <p>As a reminder, payment for your article placement is due upon publication. Please use the secure link below to complete your payment at your earliest convenience.</p>
        <p><a href="${opts.paymentLinkUrl}" style="background:#2563eb;color:white;padding:10px 20px;text-decoration:none;border-radius:4px;display:inline-block">Pay Now — ${amount}</a></p>
        <p style="font-size:12px;color:#6b7280"><strong>Please note:</strong> if payment is not received within 7 days of publication, your article or link will be automatically removed from the SimpleShowing blog.</p>
        <p style="font-size:12px;color:#6b7280">If you have any questions about payment, please reply to this email.</p>
      `
      : "";
    await resend.emails.send({
      from: FROM,
      to: opts.to,
      subject: `Your article is live: "${opts.title}"`,
      html: `
        <p>Hi ${opts.partnerName},</p>
        <p>Your article is now live on the SimpleShowing blog!</p>
        <p><strong>Article:</strong> ${opts.title}<br/>
        <strong>Live URL:</strong> <a href="${opts.wpPostUrl}">${opts.wpPostUrl}</a></p>
        <p>Feel free to share the link with your audience. Thank you for contributing to SimpleShowing!</p>
        ${paymentSection}
        <p>Best,<br/>The SimpleShowing Team</p>
      `,
    });
  } catch (err) {
    console.error("[email] sendPartnerPublished failed:", err);
  }
}

/** Payment received confirmation — sent after Stripe webhook confirms payment. */
export async function sendPartnerPaymentReceived(opts: {
  to: string;
  partnerName: string;
  articleTitle: string;
  amountCents: number;
  wpPostUrl: string;
}): Promise<void> {
  try {
    const resend = getResend();
    if (!resend) return;
    const amount = `$${(opts.amountCents / 100).toFixed(2)}`;
    await resend.emails.send({
      from: FROM,
      to: opts.to,
      subject: `Payment received — thank you!`,
      html: `
        <p>Hi ${opts.partnerName},</p>
        <p>We've received your payment of <strong>${amount}</strong> for your article placement on SimpleShowing. Thank you!</p>
        <p><strong>Article:</strong> <a href="${opts.wpPostUrl}">${opts.articleTitle}</a></p>
        <p>Your article will remain live on the SimpleShowing blog. If you have any questions, please reply to this email.</p>
        <p>Best,<br/>The SimpleShowing Team</p>
      `,
    });
  } catch (err) {
    console.error("[email] sendPartnerPaymentReceived failed:", err);
  }
}

/** Payment reminder email — sent at day 3, 5, or 7 after publication. */
export async function sendPartnerPaymentReminder(opts: {
  to: string;
  partnerName: string;
  articleTitle: string;
  amountCents: number;
  wpPostUrl: string;
  paymentLinkUrl: string;
  dayNumber: 3 | 5 | 7;
}): Promise<void> {
  try {
    const resend = getResend();
    if (!resend) return;
    const amount = `$${(opts.amountCents / 100).toFixed(2)}`;
    const isUrgent = opts.dayNumber === 7;
    const subject = isUrgent
      ? `Action required: Your article will be removed today — "${opts.articleTitle}"`
      : `Reminder: Payment due for your SimpleShowing article`;
    const urgencyNote = isUrgent
      ? `<p style="color:#c0392b"><strong>⚠️ This is your final notice. Your article will be removed from SimpleShowing today unless payment is received.</strong></p>`
      : opts.dayNumber === 5
      ? `<p><strong>This is your second reminder.</strong> Please complete payment to keep your article live.</p>`
      : `<p>This is a friendly reminder that payment is still outstanding for your article placement.</p>`;
    await resend.emails.send({
      from: FROM,
      to: opts.to,
      subject,
      html: `
        <p>Hi ${opts.partnerName},</p>
        ${urgencyNote}
        <p><strong>Article:</strong> <a href="${opts.wpPostUrl}">${opts.articleTitle}</a><br/>
        <strong>Amount due:</strong> ${amount}</p>
        <p><a href="${opts.paymentLinkUrl}" style="background:#2563eb;color:white;padding:10px 20px;text-decoration:none;border-radius:4px;display:inline-block">Pay Now — ${amount}</a></p>
        <p>If you have any questions, please reply to this email.</p>
        <p>Best,<br/>The SimpleShowing Team</p>
      `,
    });
  } catch (err) {
    console.error("[email] sendPartnerPaymentReminder failed:", err);
  }
}

/** Removal notice — sent at day 7 when article is unpublished due to non-payment. */
export async function sendPartnerRemovedUnpaid(opts: {
  to: string;
  partnerName: string;
  articleTitle: string;
  amountCents: number;
  paymentLinkUrl: string;
}): Promise<void> {
  try {
    const resend = getResend();
    if (!resend) return;
    const amount = `$${(opts.amountCents / 100).toFixed(2)}`;
    await resend.emails.send({
      from: FROM,
      to: opts.to,
      subject: `Your article has been removed — "${opts.articleTitle}"`,
      html: `
        <p>Hi ${opts.partnerName},</p>
        <p>We're writing to let you know that your article <strong>"${opts.articleTitle}"</strong> has been removed from the SimpleShowing blog due to outstanding payment of <strong>${amount}</strong>.</p>
        <p>To restore your article, please complete payment using the link below:</p>
        <p><a href="${opts.paymentLinkUrl}" style="background:#2563eb;color:white;padding:10px 20px;text-decoration:none;border-radius:4px;display:inline-block">Pay ${amount} to Restore Article</a></p>
        <p>Once payment is confirmed, your article will be reinstated within 24 hours.</p>
        <p>If you have any questions or believe this was an error, please reply to this email.</p>
        <p>Best,<br/>The SimpleShowing Team<br/>hello@simpleshowing.com</p>
      `,
    });
  } catch (err) {
    console.error("[email] sendPartnerRemovedUnpaid failed:", err);
  }
}

/** Invite email sent to a new editor when an admin adds them to the dashboard. */
export async function sendEditorInvite(opts: {
  to: string;
  name: string | null;
}): Promise<void> {
  try {
    const resend = getResend();
    if (!resend) return;
    const greeting = opts.name ? `Hi ${opts.name},` : "Hi,";
    await resend.emails.send({
      from: FROM,
      to: opts.to,
      subject: "You've been invited to the SimpleShowing Content Dashboard",
      html: `
        <p>${greeting}</p>
        <p>You've been invited to access the SimpleShowing Content Operations dashboard.</p>
        <p>To get started, simply sign in with your Google account at the link below — make sure to use the email address this invitation was sent to (<strong>${opts.to}</strong>).</p>
        <p><a href="https://dash.simpleshowing.co" style="background:#0d9488;color:white;padding:10px 20px;text-decoration:none;border-radius:4px;display:inline-block">Access the Dashboard</a></p>
        <p>If you have any questions, reply to this email and we'll help you get set up.</p>
        <p>Best,<br/>The SimpleShowing Team</p>
      `,
    });
  } catch (err) {
    console.error("[email] sendEditorInvite failed:", err);
  }
}
