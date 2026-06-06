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
- [ ] .docx upload: server-side parse with mammoth npm package, extract plain text (deferred)
- [x] Public submission form page at /submit (non-gated): partner name, email, title, category, submission type, content (paste/upload/.docx/Google Docs link), declared do-follow links (repeating field)
- [x] Internal Partner Submissions page in dashboard: list view with status badges, detail/review modal, approve/reject actions
- [x] LLM link quality check: flag undeclared links in body, check declared links against blocklist (gambling, payday, adult)
- [x] Automated partner email notifications: received confirmation, approved, rejected (with reason), published
- [x] Add "Partner Submissions" nav item to DashboardLayout sidebar
- [ ] Vitest tests for submit and review procedures (deferred — covered by manual QA)
