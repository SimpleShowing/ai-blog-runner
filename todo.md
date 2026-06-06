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
