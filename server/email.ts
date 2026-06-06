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

/** Published email sent when the article goes live on WordPress. */
export async function sendPartnerPublished(opts: {
  to: string;
  partnerName: string;
  title: string;
  referenceId: number;
  wpPostUrl: string;
}): Promise<void> {
  try {
    const resend = getResend();
    if (!resend) return;
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
        <p>Best,<br/>The SimpleShowing Team</p>
      `,
    });
  } catch (err) {
    console.error("[email] sendPartnerPublished failed:", err);
  }
}
