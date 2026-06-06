import { eq, desc, and, like, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
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
  type Topic,
  type InsertTopic,
  type Brief,
  type InsertBrief,
  type Draft,
  type InsertDraft,
  type Comment,
  type Setting,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
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

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
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
  return db.select().from(invitedEditors).where(eq(invitedEditors.isActive, true)).orderBy(desc(invitedEditors.createdAt));
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

// Emails and domains that always have admin access (no invite required).
const ADMIN_EMAILS = new Set(["fredmcgill@gmail.com", "fred@simpleshowing.com"]);
function isAdminEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return ADMIN_EMAILS.has(lower) || lower.endsWith("@simpleshowing.com");
}

export async function isEmailAllowed(email: string, openId: string): Promise<boolean> {
  // Owner by openId (Manus auth)
  if (openId === ENV.ownerOpenId) return true;
  // Admin emails + entire @simpleshowing.com domain
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
  const [result] = await db.insert(topics).values(data);
  return (result as any).insertId as number;
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
  const result = await db.select().from(briefs).where(eq(briefs.topicId, topicId)).orderBy(desc(briefs.createdAt)).limit(1);
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
  const [result] = await db.insert(briefs).values(data);
  return (result as any).insertId as number;
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
  const [result] = await db.insert(drafts).values(data);
  return (result as any).insertId as number;
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
  const result = await db.select().from(qaResults).where(eq(qaResults.draftId, draftId)).orderBy(desc(qaResults.runAt)).limit(1);
  return result[0];
}

export async function createQaResult(data: typeof qaResults.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(qaResults).values(data);
  return (result as any).insertId as number;
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export async function getCommentsByDraftId(draftId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(comments).where(eq(comments.draftId, draftId)).orderBy(desc(comments.createdAt));
}

export async function createComment(data: typeof comments.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(comments).values(data);
  return (result as any).insertId as number;
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
  return db.select().from(wpPublishLogs).where(eq(wpPublishLogs.draftId, draftId)).orderBy(desc(wpPublishLogs.pushedAt));
}

export async function createWpLog(data: typeof wpPublishLogs.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(wpPublishLogs).values(data);
  return (result as any).insertId as number;
}

export async function getAllWpLogs() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(wpPublishLogs).orderBy(desc(wpPublishLogs.pushedAt)).limit(50);
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
    .onDuplicateKeyUpdate({ set: { value } });
}

export async function setSettings(pairs: Record<string, string>) {
  for (const [key, value] of Object.entries(pairs)) {
    await setSetting(key, value);
  }
}
