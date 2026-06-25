with open('server/routers.ts', 'r') as f:
    content = f.read()

# Insert new approveAndPublish mutation right before the existing `reject` mutation
marker = '''  /** Admin: reject a submission */
  reject: adminProcedure'''

new_mutation = '''  /** Admin: approve a submission AND push it live to WordPress in one step */
  approveAndPublish: adminProcedure
    .input(z.object({ id: z.number(), reviewNotes: z.string().optional(), origin: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const sub = await getPartnerSubmissionById(input.id);
      if (!sub) throw new TRPCError({ code: "NOT_FOUND" });

      const wpUrl = await getSetting("wp_url");
      const wpUsername = await getSetting("wp_username");
      const wpAppPassword = await getSetting("wp_app_password");
      if (!wpUrl || !wpUsername || !wpAppPassword) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "WordPress credentials not configured. Please update Settings." });
      }
      const credentials = Buffer.from(`${wpUsername}:${wpAppPassword}`).toString("base64");
      const apiBase = wpUrl.replace(/\\/$/, "") + "/wp-json/wp/v2";

      let bodyContent = sub.contentText || "";
      if (!bodyContent && sub.googleDocsUrl) {
        try {
          const match = sub.googleDocsUrl.match(/\\/d\\/([a-zA-Z0-9_-]+)/);
          if (match) {
            const exportUrl = `https://docs.google.com/document/d/${match[1]}/export?format=txt`;
            const docRes = await fetch(exportUrl);
            if (docRes.ok) bodyContent = await docRes.text();
          }
        } catch (docErr) {
          console.error("[approveAndPublish] Google Docs fetch failed:", docErr);
        }
      }
      if (!bodyContent) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No content found to publish (no pasted text or accessible Google Doc)." });
      }

      // Append declared links into content footer (do-follow, internal, authoritative)
      const linksHtml = (sub.declaredLinks || []).map(l =>
        `<a href="${l.url}">${l.anchorText}</a>`
      );

      const postPayload: Record<string, unknown> = {
        title: sub.title,
        content: bodyContent,
        status: "publish",
      };

      let wpPostId: number | undefined;
      let wpPostUrl: string | undefined;

      try {
        const response = await fetch(`${apiBase}/posts`, {
          method: "POST",
          headers: { "Authorization": `Basic ${credentials}`, "Content-Type": "application/json" },
          body: JSON.stringify(postPayload),
        });
        const data = await response.json() as any;
        if (!response.ok || !data.id) {
          throw new Error(data.message || `WP API error: ${response.status}`);
        }
        wpPostId = data.id;
        wpPostUrl = data.link;
      } catch (wpErr: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Failed to publish to WordPress: ${wpErr.message || wpErr}` });
      }

      const publishedAt = new Date();
      const successUrl = `${input.origin ?? "https://dash.simpleshowing.co"}/payment-success`;

      let stripePaymentLinkId: string | undefined;
      let stripePaymentLinkUrl: string | undefined;
      try {
        const link = await createPartnerPaymentLink({
          submissionId: sub.id,
          partnerEmail: sub.partnerEmail,
          partnerName: sub.partnerName,
          articleTitle: sub.title,
          amountCents: sub.amountCents ?? getPriceForSubmission(sub.submissionType ?? "guest_post", sub.extraDfLink ?? false),
          successUrl,
        });
        stripePaymentLinkId = link.id;
        stripePaymentLinkUrl = link.url;
      } catch (stripeErr) {
        console.error("[approveAndPublish] Stripe Payment Link creation failed:", stripeErr);
      }

      let reminderDay3TaskUid: string | undefined;
      let reminderDay5TaskUid: string | undefined;
      let reminderDay7TaskUid: string | undefined;
      try {
        const uids = await schedulePaymentReminders(sub.id, publishedAt);
        reminderDay3TaskUid = uids.day3;
        reminderDay5TaskUid = uids.day5;
        reminderDay7TaskUid = uids.day7;
      } catch (schedErr) {
        console.error("[approveAndPublish] Failed to schedule payment reminders:", schedErr);
      }

      await updatePartnerSubmission(input.id, {
        status: "published",
        reviewNotes: input.reviewNotes ?? sub.reviewNotes,
        reviewedBy: ctx.user.id,
        reviewedAt: new Date(),
        wpPostId: wpPostId ?? null,
        wpPostUrl: wpPostUrl ?? null,
        publishedAt,
        stripePaymentLinkId: stripePaymentLinkId ?? null,
        stripePaymentLinkUrl: stripePaymentLinkUrl ?? null,
        reminderDay3TaskUid: reminderDay3TaskUid ?? null,
        reminderDay5TaskUid: reminderDay5TaskUid ?? null,
        reminderDay7TaskUid: reminderDay7TaskUid ?? null,
      });

      try {
        await notifyOwner({
          title: `Submission Published: ${sub.title}`,
          content: `"${sub.title}" by ${sub.partnerName} (${sub.partnerEmail}) has been approved and published to WordPress.\\nView: ${wpPostUrl}`,
        });
      } catch (err) {
        console.warn('[notifyOwner] non-blocking failure:', err);
      }

      if (wpPostUrl) {
        await sendPartnerPublished({
          to: sub.partnerEmail,
          partnerName: sub.partnerName,
          title: sub.title,
          referenceId: sub.id,
          wpPostUrl,
          paymentLinkUrl: stripePaymentLinkUrl,
          amountCents: sub.amountCents ?? getPriceForSubmission(sub.submissionType ?? "guest_post", sub.extraDfLink ?? false),
        });
      }

      return { success: true, wpPostId, wpPostUrl, stripePaymentLinkUrl };
    }),

  /** Admin: reject a submission */
  reject: adminProcedure'''

if marker in content:
    content = content.replace(marker, new_mutation, 1)
    print("✅ Inserted approveAndPublish mutation")
else:
    print("❌ Could not find marker")

with open('server/routers.ts', 'w') as f:
    f.write(content)
