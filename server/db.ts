import { eq, desc, and, isNotNull, ne, inArray, asc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  InsertUser,
  users,
  topics,
  briefs,
  drafts,
  qaResults,
  comments,
  wpPublishLogs,
  settings,
  invitedEditors,
  partnerSubmissions,
  blogTopics,
  generatedPosts,
  postRefreshLog,
  type Topic,
  type InsertTopic,
  type Brief,
  type InsertBrief,
  type Draft,
  type InsertDraft,
  type Comment,
  type Setting,
  type PartnerSubmission,
  type InsertPartnerSubmission,
  type BlogTopic,
  type InsertBlogTopic,
  type GeneratedPost,
  type InsertGeneratedPost,
  type InsertPostRefreshLog,
  type PostRefreshLog,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const client = postgres(process.env.DATABASE_URL, { max: 10 });
      _db = drizzle(client);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];
  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId || (user.email && isAdminEmail(user.email))) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db
    .insert(users)
    .values(values)
    .onConflictDoUpdate({ target: users.openId, set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(desc(users.createdAt));
}

// ─── Invited Editors ──────────────────────────────────────────────────────────

export async function getInvitedEditors() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(invitedEditors)
    .where(eq(invitedEditors.isActive, true))
    .orderBy(desc(invitedEditors.createdAt));
}

export async function inviteEditor(email: string, name: string | null, invitedBy: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(invitedEditors).values({ email, name, invitedBy, isActive: true });
}

export async function removeEditor(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(invitedEditors).set({ isActive: false }).where(eq(invitedEditors.id, id));
}

const ADMIN_EMAILS = new Set(["fredmcgill@gmail.com", "fred@simpleshowing.com"]);
function isAdminEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return ADMIN_EMAILS.has(lower) || lower.endsWith("@simpleshowing.com");
}

export async function isEmailAllowed(email: string, openId: string): Promise<boolean> {
  if (openId === ENV.ownerOpenId) return true;
  if (email && isAdminEmail(email)) return true;
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .select()
    .from(invitedEditors)
    .where(and(eq(invitedEditors.email, email), eq(invitedEditors.isActive, true)))
    .limit(1);
  return result.length > 0;
}

// ─── Topics ───────────────────────────────────────────────────────────────────

export async function getTopics(status?: string) {
  const db = await getDb();
  if (!db) return [];
  if (status) {
    return db
      .select()
      .from(topics)
      .where(eq(topics.status, status as Topic["status"]))
      .orderBy(desc(topics.createdAt));
  }
  return db.select().from(topics).orderBy(desc(topics.createdAt));
}

export async function getTopicById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(topics).where(eq(topics.id, id)).limit(1);
  return result[0];
}

export async function createTopic(data: InsertTopic) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(topics).values(data).returning({ id: topics.id });
  return result.id;
}

export async function updateTopic(id: number, data: Partial<InsertTopic>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(topics).set(data).where(eq(topics.id, id));
}

export async function deleteTopic(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(topics).where(eq(topics.id, id));
}

// ─── Briefs ───────────────────────────────────────────────────────────────────

export async function getBriefByTopicId(topicId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(briefs)
    .where(eq(briefs.topicId, topicId))
    .orderBy(desc(briefs.createdAt))
    .limit(1);
  return result[0];
}

export async function getBriefById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(briefs).where(eq(briefs.id, id)).limit(1);
  return result[0];
}

export async function createBrief(data: InsertBrief) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(briefs).values(data).returning({ id: briefs.id });
  return result.id;
}

export async function updateBrief(id: number, data: Partial<InsertBrief>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(briefs).set(data).where(eq(briefs.id, id));
}

// ─── Drafts ───────────────────────────────────────────────────────────────────

export async function getDraftsByTopicId(topicId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(drafts).where(eq(drafts.topicId, topicId)).orderBy(desc(drafts.createdAt));
}

export async function getDraftById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(drafts).where(eq(drafts.id, id)).limit(1);
  return result[0];
}

export async function getAllDrafts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(drafts).orderBy(desc(drafts.createdAt));
}

export async function createDraft(data: InsertDraft) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(drafts).values(data).returning({ id: drafts.id });
  return result.id;
}

export async function updateDraft(id: number, data: Partial<InsertDraft>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(drafts).set(data).where(eq(drafts.id, id));
}

// ─── QA Results ───────────────────────────────────────────────────────────────

export async function getLatestQaForDraft(draftId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(qaResults)
    .where(eq(qaResults.draftId, draftId))
    .orderBy(desc(qaResults.runAt))
    .limit(1);
  return result[0];
}

export async function createQaResult(data: typeof qaResults.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(qaResults).values(data).returning({ id: qaResults.id });
  return result.id;
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export async function getCommentsByDraftId(draftId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(comments)
    .where(eq(comments.draftId, draftId))
    .orderBy(desc(comments.createdAt));
}

export async function createComment(data: typeof comments.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(comments).values(data).returning({ id: comments.id });
  return result.id;
}

export async function resolveComment(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(comments).set({ resolved: true }).where(eq(comments.id, id));
}

// ─── WP Publish Logs ──────────────────────────────────────────────────────────

export async function getWpLogsForDraft(draftId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(wpPublishLogs)
    .where(eq(wpPublishLogs.draftId, draftId))
    .orderBy(desc(wpPublishLogs.pushedAt));
}

export async function createWpLog(data: typeof wpPublishLogs.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(wpPublishLogs).values(data).returning({ id: wpPublishLogs.id });
  return result.id;
}

export async function getAllWpLogs() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: wpPublishLogs.id,
      draftId: wpPublishLogs.draftId,
      topicId: wpPublishLogs.topicId,
      wpPostId: wpPublishLogs.wpPostId,
      wpPostUrl: wpPublishLogs.wpPostUrl,
      wpStatus: wpPublishLogs.wpStatus,
      pushedBy: wpPublishLogs.pushedBy,
      rankMathPopulated: wpPublishLogs.rankMathPopulated,
      success: wpPublishLogs.success,
      errorMessage: wpPublishLogs.errorMessage,
      pushedAt: wpPublishLogs.pushedAt,
      draftTitle: drafts.title,
    })
    .from(wpPublishLogs)
    .leftJoin(drafts, eq(drafts.id, wpPublishLogs.draftId))
    .orderBy(desc(wpPublishLogs.pushedAt))
    .limit(50);
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return result[0]?.value ?? null;
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.select().from(settings);
  return Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
}

export async function setSetting(key: string, value: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

export async function setSettings(pairs: Record<string, string>) {
  for (const [key, value] of Object.entries(pairs)) {
    await setSetting(key, value);
  }
}

// ─── Partner Submissions ──────────────────────────────────────────────────────

export async function createPartnerSubmission(
  data: InsertPartnerSubmission
): Promise<PartnerSubmission> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [row] = await db.insert(partnerSubmissions).values(data).returning();
  return row;
}

export async function getPartnerSubmissions(): Promise<PartnerSubmission[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(partnerSubmissions).orderBy(desc(partnerSubmissions.createdAt));
}

export async function getPartnerSubmissionById(id: number): Promise<PartnerSubmission | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(partnerSubmissions).where(eq(partnerSubmissions.id, id));
  return row ?? null;
}

export async function updatePartnerSubmission(
  id: number,
  data: Partial<InsertPartnerSubmission>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(partnerSubmissions).set(data).where(eq(partnerSubmissions.id, id));
}

export async function getPublishedSubmissionsWithPayment(): Promise<PartnerSubmission[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(partnerSubmissions)
    .where(isNotNull(partnerSubmissions.publishedAt))
    .orderBy(desc(partnerSubmissions.publishedAt));
}

export async function getUnpaidSubmissions(): Promise<PartnerSubmission[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(partnerSubmissions)
    .where(
      and(
        isNotNull(partnerSubmissions.publishedAt),
        ne(partnerSubmissions.paymentStatus, "paid")
      )
    )
    .orderBy(desc(partnerSubmissions.publishedAt));
}

// ─── Blog Topics ──────────────────────────────────────────────────────────────

export async function bulkInsertBlogTopics(rows: InsertBlogTopic[]): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (rows.length === 0) return 0;
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await db
      .insert(blogTopics)
      .values(batch)
      .onConflictDoUpdate({ target: blogTopics.keyword, set: { keyword: sql`EXCLUDED.keyword` } });
    inserted += batch.length;
  }
  return inserted;
}

export async function getBlogTopics(opts?: {
  status?: BlogTopic["status"];
  contentType?: BlogTopic["contentType"];
  limit?: number;
  offset?: number;
  sortBy?: "priority" | "traffic" | "position" | "referringDomains" | "numKeywords" | "keyword";
  sortDir?: "asc" | "desc";
}) {
  const db = await getDb();
  if (!db) return [];
  let q = db.select().from(blogTopics).$dynamic();
  const conditions = [];
  if (opts?.status) conditions.push(eq(blogTopics.status, opts.status));
  if (opts?.contentType) conditions.push(eq(blogTopics.contentType, opts.contentType));
  if (conditions.length > 0) q = q.where(and(...conditions));
  const dir = opts?.sortDir ?? "desc";
  const col = opts?.sortBy;
  const sortFn = dir === "asc" ? asc : desc;
  if (col === "traffic") q = q.orderBy(sortFn(blogTopics.traffic));
  else if (col === "position") q = q.orderBy(sortFn(blogTopics.position));
  else if (col === "referringDomains") q = q.orderBy(sortFn(blogTopics.referringDomains));
  else if (col === "numKeywords") q = q.orderBy(sortFn(blogTopics.numKeywords));
  else if (col === "keyword") q = q.orderBy(sortFn(blogTopics.keyword));
  else q = q.orderBy(desc(blogTopics.priority), desc(blogTopics.traffic));
  if (opts?.limit) q = q.limit(opts.limit);
  if (opts?.offset) q = q.offset(opts.offset);
  return q;
}

export async function countBlogTopics(opts?: {
  status?: BlogTopic["status"];
  contentType?: BlogTopic["contentType"];
}): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const conditions = [];
  if (opts?.status) conditions.push(eq(blogTopics.status, opts.status));
  if (opts?.contentType) conditions.push(eq(blogTopics.contentType, opts.contentType));
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(blogTopics)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  return Number(result[0]?.count ?? 0);
}

export async function getNextPendingBlogTopic(): Promise<BlogTopic | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(blogTopics)
    .where(eq(blogTopics.status, "pending"))
    .orderBy(desc(blogTopics.priority), desc(blogTopics.traffic))
    .limit(1);
  return result[0] ?? null;
}

export async function updateBlogTopicStatus(
  id: number,
  status: BlogTopic["status"]
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(blogTopics).set({ status }).where(eq(blogTopics.id, id));
}

// ─── Generated Posts ──────────────────────────────────────────────────────────

export async function createGeneratedPost(data: InsertGeneratedPost): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(generatedPosts).values(data).returning({ id: generatedPosts.id });
  return result.id;
}

export async function updateGeneratedPost(
  id: number,
  data: Partial<InsertGeneratedPost>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(generatedPosts).set(data).where(eq(generatedPosts.id, id));
}

export async function getGeneratedPosts(opts?: {
  contentType?: GeneratedPost["contentType"];
  status?: GeneratedPost["status"];
  affiliateFlag?: boolean;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  let q = db
    .select({
      id: generatedPosts.id,
      topicId: generatedPosts.topicId,
      title: generatedPosts.title,
      wpPostId: generatedPosts.wpPostId,
      wpPostUrl: generatedPosts.wpPostUrl,
      contentType: generatedPosts.contentType,
      affiliateFlag: generatedPosts.affiliateFlag,
      status: generatedPosts.status,
      errorMessage: generatedPosts.errorMessage,
      publishedAt: generatedPosts.publishedAt,
      createdAt: generatedPosts.createdAt,
      keyword: blogTopics.keyword,
      traffic: blogTopics.traffic,
    })
    .from(generatedPosts)
    .leftJoin(blogTopics, eq(blogTopics.id, generatedPosts.topicId))
    .$dynamic();
  const conditions = [];
  if (opts?.contentType) conditions.push(eq(generatedPosts.contentType, opts.contentType));
  if (opts?.status) conditions.push(eq(generatedPosts.status, opts.status));
  if (opts?.affiliateFlag !== undefined)
    conditions.push(eq(generatedPosts.affiliateFlag, opts.affiliateFlag));
  if (conditions.length > 0) q = q.where(and(...conditions));
  q = q.orderBy(desc(generatedPosts.createdAt));
  if (opts?.limit) q = q.limit(opts.limit);
  if (opts?.offset) q = q.offset(opts.offset);
  return q;
}

export async function countGeneratedPosts(opts?: {
  contentType?: GeneratedPost["contentType"];
  status?: GeneratedPost["status"];
}): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const conditions = [];
  if (opts?.contentType) conditions.push(eq(generatedPosts.contentType, opts.contentType));
  if (opts?.status) conditions.push(eq(generatedPosts.status, opts.status));
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(generatedPosts)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  return Number(result[0]?.count ?? 0);
}

export async function bulkDeleteBlogTopics(ids: number[]) {
  if (ids.length === 0) return;
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(blogTopics).where(inArray(blogTopics.id, ids));
}

// ─── Post Refresh Log ─────────────────────────────────────────────────────────

export async function createRefreshLog(data: InsertPostRefreshLog): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(postRefreshLog).values(data).returning({ id: postRefreshLog.id });
  return result.id;
}

export async function updateRefreshLog(
  id: number,
  data: Partial<InsertPostRefreshLog>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(postRefreshLog).set(data).where(eq(postRefreshLog.id, id));
}

export async function getRefreshHistory(): Promise<PostRefreshLog[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(postRefreshLog).orderBy(desc(postRefreshLog.createdAt)).limit(200);
}

export async function getRefreshedPostIds(): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ wpPostId: postRefreshLog.wpPostId })
    .from(postRefreshLog)
    .where(eq(postRefreshLog.status, "done"));
  return rows.map((r) => r.wpPostId);
}
