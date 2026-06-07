# SimpleShowing AI Content Dashboard — TODO

## Phase 1: Schema & Database
- [x] Define all database tables in drizzle/schema.ts (topics, briefs, drafts, qa_results, comments, approvals, wp_publish_logs, settings, invited_editors)
- [x] Generate and apply migration SQL
- [x] Add query helpers in server/db.ts

## Phase 2: Server Routers
- [x] topics router: CRUD, prioritize, assign, status transitions
- [x] briefs router: generate brief via LLM, get, update
- [x] drafts router: generate draft via LLM, get, update
- [x] qa router: run automated QA checks, get results
- [x] approvals router: submit review, comment, approve/reject (merged into drafts router)
- [x] wordpress router: push to WP as draft/pending, populate Rank Math fields
- [x] settings router: get/update WP credentials, brand voice, CTAs, markets, forbidden claims
- [x] editors router: invite, list, remove editors
- [x] notifications: notify owner on WP push success via notifyOwner helper

## Phase 3: Layout & Auth
- [x] DashboardLayout with sidebar navigation for all sections
- [x] Gated login — only owner and invited editors can access (enforced in context.ts)
- [x] Access control middleware (adminProcedure for admin-only routes)
- [x] Global design system: dark elegant theme, typography, color palette

## Phase 4: Topic Queue & Brief Generation
- [x] Topic Queue page: list, add, edit, prioritize, assign, status badge
- [x] Topic detail page: content pillar, target market, conversion goal, status
- [x] Brief Generation: trigger LLM brief, view structured brief (SERP notes, outline, internal links, FAQs, citations, CTA strategy)
- [x] Brief editor: allow manual edits before draft generation

## Phase 5: Draft Generation, QA & Editorial Approval
- [x] Draft Generation: trigger LLM draft from brief, view full draft
- [x] Draft editor: markdown view with edit capability
- [x] QA panel: run checks, display results (title/H1, meta desc, internal links, citations, readability, cannibalization flags)
- [x] Editorial Approval workflow: status pipeline (draft → in review → approved / rejected → published)
- [x] Comments panel: inline comments, revision requests

## Phase 6: WordPress Publishing, Settings & Notifications
- [x] WordPress publish action: push to WP REST API as draft/pending
- [x] Rank Math SEO fields: populate rank_math_title, rank_math_description, rank_math_focus_keyword, rank_math_canonical_url
- [x] WP publish log page: track push history, WP post ID, status, Rank Math flag
- [x] Settings panel: WP credentials (URL, username, app password), brand voice, CTAs, target markets, forbidden claims, style guide
- [x] Editor management: invite/remove editors (admin only)
- [x] Notifications: owner notified on WP push success

## Phase 7: Polish & Delivery
- [x] Invited-editor allowlist enforcement in context.ts (non-allowlisted users get null user)
- [x] Settings.tsx: editors.list query gated to admin only (enabled: isAdmin)
- [x] Vitest unit tests for key routers (21 tests passing)
- [x] Final checkpoint and delivery

## Phase 9: WP Push Improvements (Round 2)

- [x] Include live WP post URL in owner notification email on successful push
- [x] Add search bar to Publish Log page (filter by article title)
- [x] Auto-assign WordPress categories via LLM during push (suggest 1-3 categories, look up or create via WP REST API, assign to post)

## Phase 10: Partner Blog Submission Portal

- [x] Add partner_submissions table to drizzle/schema.ts (id, partnerName, partnerEmail, title, category, submissionType, contentText, contentFileKey, googleDocsUrl, declaredLinks JSON, targetArticleUrl, status, reviewNotes, wpPostId, createdAt, updatedAt)
- [x] Generate and apply migration SQL
- [x] Add db helpers: createPartnerSubmission, getPartnerSubmissions, getPartnerSubmissionById, updatePartnerSubmission
- [x] Add tRPC procedures: partnerSubmissions.submit (public), partnerSubmissions.list (admin), partnerSubmissions.get (admin), partnerSubmissions.review (admin), partnerSubmissions.approve (admin), partnerSubmissions.reject (admin)
- [x] .docx upload: add file input to /submit form and server-side mammoth parse endpoint
- [x] Public submission form page at /submit (non-gated): partner name, email, title, category, submission type, content (paste/upload/.docx/Google Docs link), declared do-follow links (repeating field)
- [x] Internal Partner Submissions page in dashboard: list view with status badges, detail/review modal, approve/reject actions
- [x] LLM link quality check: flag undeclared links in body, check declared links against blocklist (gambling, payday, adult)
- [x] Automated partner email notifications: received confirmation, approved, rejected (with reason), published
- [x] Add "Partner Submissions" nav item to DashboardLayout sidebar
- [x] Vitest tests for partnerSubmissions procedures: submit, startReview, approve, reject, runLinkQa

## Phase 11: Resend Email Integration

- [x] Install resend npm package (v6.12.4)
- [x] Add RESEND_API_KEY to env.ts and project secrets
- [x] Create server/email.ts with 4 typed partner email helpers (sendPartnerSubmissionReceived, sendPartnerApproved, sendPartnerRejected, sendPartnerPublished)
- [x] Wire sendPartnerSubmissionReceived into partnerSubmissions.submit procedure
- [x] Wire sendPartnerApproved into partnerSubmissions.approve procedure
- [x] Wire sendPartnerRejected into partnerSubmissions.reject procedure (includes review reason)
- [x] Wire sendPartnerPublished into partnerSubmissions.markPublished procedure (includes live WP URL)
- [x] Mock email module in Vitest; add email-assertion tests for all 4 stages (41 tests passing, 0 TS errors)

## Phase 12: Stripe Pay-After-Publish Integration

- [x] Run webdev_add_feature stripe scaffold
- [x] Store STRIPE_SECRET_KEY and VITE_STRIPE_PUBLISHABLE_KEY as secrets
- [x] Add payment fields to partner_submissions schema (amountCents, paymentStatus, stripePaymentLinkId, stripePaymentLinkUrl, publishedAt, paidAt, paymentGraceExtended, reminderDay3/5/7TaskUid, extraDfLink)
- [x] Create server/stripe.ts with lazy Stripe client, PRICES constants, createPartnerPaymentLink, getPriceForSubmission
- [x] Create server/stripeWebhook.ts — webhook handler for checkout.session.completed
- [x] Create server/paymentReminders.ts — scheduled handler for day 3/5/7 reminders + auto-unpublish on day 7
- [x] Create server/scheduleReminders.ts — schedules heartbeat jobs for day 3/5/7
- [x] Register Stripe webhook route and payment reminder route in server/_core/index.ts
- [x] Update submission form: 3-link enforcement for guest posts, link type fields, 2nd DF add-on toggle ($150 → $175), link insertion form
- [x] Update markPublished procedure: create Stripe Payment Link, schedule reminders, return stripePaymentLinkUrl
- [x] Update published email to include payment link and amount
- [x] Add extendGrace and restorePublished procedures
- [x] Update PartnerSubmissions dashboard: payment status badge, Mark as Published dialog, grace extension toggle, link QA checklist
- [x] Add stripe/scheduleReminders mocks to test file, restore in beforeEach, add extendGrace/restorePublished tests
- [x] 43 tests passing, 0 TypeScript errors

## Phase 13: Payments Dashboard Tab

- [x] Add "Payments" nav item to DashboardLayout sidebar
- [x] Create /payments page with two tabs: "All Payments" and "Unpaid / Overdue"
- [x] All Payments tab: table of all partner submissions with payment status badge, amount, published date, paid date, Stripe Payment Link button
- [x] Unpaid/Overdue tab: filter to submissions where paymentStatus != 'paid' and publishedAt is set — show days overdue, reminder status (day 3/5/7 sent), grace extended badge, quick actions (extend grace, copy payment link, mark removed)
- [x] Add tRPC procedures: payments.list (admin) returning all published submissions with payment fields, payments.listUnpaid (admin) returning unpaid/overdue submissions
- [x] Add server/db.ts helpers: getPublishedSubmissionsWithPayment, getUnpaidSubmissions

## Phase 14: Automated Blog Post Pipeline

- [x] Add blog_topics and generated_posts tables to drizzle/schema.ts
- [x] Generate and apply migration SQL for new tables
- [x] Add DB helpers: getBlogTopics, countBlogTopics, getNextPendingBlogTopic, updateBlogTopicStatus, bulkInsertBlogTopics, getGeneratedPosts, countGeneratedPosts, createGeneratedPost, updateGeneratedPost
- [x] Create server/blogPostGenerator.ts — scheduled handler for daily AI post generation (picks next pending topic, calls LLM with editorial brief, publishes to WordPress, marks topic as used)
- [x] Content-type-aware CTA strategy (lead_gen: home valuation CTA, affiliate: affiliate link placeholder, comparison: fair comparison with SimpleShowing mention, informational: 1 soft internal link)
- [x] Register /api/scheduled/blogPostGenerator route in server/_core/index.ts
- [x] Add blogPipeline tRPC router: listTopics, updateTopicStatus, listPosts, seedTopics, stats, setupDailyJob, getDailyJobStatus
- [x] Add "Content Pipeline" nav item to DashboardLayout sidebar (Rss icon)
- [x] Create /content-pipeline page: stats bar (pending/used/skipped/posts/published), daily job status + setup button, Topic Queue tab (filters: status, content type; skip/restore actions; pagination), Generated Posts tab (filters: type, status, affiliate-only; WP link; affiliate flag badge)
- [x] Register /content-pipeline route in App.tsx
- [x] Vitest tests: 8 new tests for blogPipeline router (51 total, all passing, 0 TS errors)
