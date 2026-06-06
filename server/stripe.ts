import Stripe from "stripe";
import { ENV } from "./_core/env";
// ─── Stripe client (lazy) ─────────────────────────────────────────────────────
let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    if (!ENV.stripeSecretKey) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(ENV.stripeSecretKey, { apiVersion: "2026-05-27.dahlia" });
  }
  return _stripe;
}
/** @deprecated use getStripe() internally; exported for test stubs only */
export const stripe = new Proxy({} as Stripe, {
  get(_t, prop) {
    return (getStripe() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

// ─── Pricing ─────────────────────────────────────────────────────────────────

export const PRICES = {
  guest_post_1_link: 15000,   // $150.00
  guest_post_2_links: 17500,  // $175.00
  link_insertion: 12500,      // $125.00
} as const;

export type PriceKey = keyof typeof PRICES;

export function getPriceForSubmission(
  submissionType: "guest_post" | "link_insertion",
  extraDfLink: boolean
): number {
  if (submissionType === "link_insertion") return PRICES.link_insertion;
  return extraDfLink ? PRICES.guest_post_2_links : PRICES.guest_post_1_link;
}

export function getPriceLabel(amountCents: number): string {
  return `$${(amountCents / 100).toFixed(2)}`;
}

// ─── Create a Stripe Payment Link ────────────────────────────────────────────

export async function createPartnerPaymentLink(params: {
  submissionId: number;
  partnerEmail: string;
  partnerName: string;
  articleTitle: string;
  amountCents: number;
  successUrl: string;
}): Promise<{ id: string; url: string }> {
  // Create a one-time price on the fly
  const price = await stripe.prices.create({
    currency: "usd",
    unit_amount: params.amountCents,
    product_data: {
      name: `Guest Post / Link Placement — ${params.articleTitle.slice(0, 80)}`,
    },
  });

  const link = await stripe.paymentLinks.create({
    line_items: [{ price: price.id, quantity: 1 }],
    after_completion: {
      type: "redirect",
      redirect: { url: params.successUrl },
    },
    metadata: {
      submission_id: String(params.submissionId),
      partner_email: params.partnerEmail,
      partner_name: params.partnerName,
    },
    customer_creation: "always",
    invoice_creation: {
      enabled: true,
      invoice_data: {
        description: `SimpleShowing — ${params.articleTitle.slice(0, 120)}`,
        metadata: { submission_id: String(params.submissionId) },
      },
    },
  });

  return { id: link.id, url: link.url };
}
