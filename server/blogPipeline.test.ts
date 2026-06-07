/**
 * Tests for the blogPipeline tRPC router.
 * Covers: listTopics, updateTopicStatus, listPosts, seedTopics, stats
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────

vi.mock("./db", async (importOriginal) => {
  const original = await importOriginal<typeof import("./db")>();
  return {
    ...original,
    getBlogTopics: vi.fn().mockResolvedValue([
      {
        id: 1,
        keyword: "how to sell a house fast",
        contentType: "lead_gen",
        traffic: 5000,
        kwVolume: 4000,
        source: "clever",
        status: "pending",
        priority: 5000,
        sourceUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]),
    countBlogTopics: vi.fn().mockResolvedValue(1),
    updateBlogTopicStatus: vi.fn().mockResolvedValue(undefined),
    bulkInsertBlogTopics: vi.fn().mockResolvedValue(3),
    getGeneratedPosts: vi.fn().mockResolvedValue([
      {
        id: 1,
        topicId: 1,
        keyword: "how to sell a house fast",
        title: "How to Sell a House Fast: What You Need to Know",
        contentType: "lead_gen",
        status: "published",
        affiliateFlag: false,
        wpPostId: 42,
        wpPostUrl: "https://simpleshowing.com/blog/how-to-sell-a-house-fast",
        publishedAt: new Date(),
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]),
    countGeneratedPosts: vi.fn().mockResolvedValue(1),
    getNextPendingBlogTopic: vi.fn().mockResolvedValue(null),
    // Keep existing helpers working
    getAllSettings: vi.fn().mockResolvedValue({}),
    getSetting: vi.fn().mockResolvedValue(null),
  };
});

// ─── Mock heartbeat ───────────────────────────────────────────────────────────

vi.mock("./_core/heartbeat", () => ({
  createHeartbeatJob: vi.fn().mockResolvedValue({ taskUid: "test-uid-123", nextExecutionAt: "2026-06-08T08:00:00Z" }),
  listHeartbeatJobs: vi.fn().mockResolvedValue({ total: 0, actorUserId: "u_test", jobs: [] }),
}));

// ─── Context helpers ──────────────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function makeAdminCtx(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@simpleshowing.com",
    name: "Admin User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      hostname: "example.com",
      headers: { cookie: "" },
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function makeUserCtx(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "regular-user",
    email: "user@example.com",
    name: "Regular User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      hostname: "example.com",
      headers: { cookie: "" },
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("blogPipeline.listTopics", () => {
  it("returns topics and total for admin", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.blogPipeline.listTopics({
      status: "pending",
      limit: 50,
      offset: 0,
    });
    expect(result.topics).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.topics[0]?.keyword).toBe("how to sell a house fast");
  });

  it("throws FORBIDDEN for non-admin users", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    await expect(
      caller.blogPipeline.listTopics({ limit: 50, offset: 0 })
    ).rejects.toThrow("Admin only");
  });
});

describe("blogPipeline.updateTopicStatus", () => {
  it("allows admin to skip a topic", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.blogPipeline.updateTopicStatus({ id: 1, status: "skipped" });
    expect(result.success).toBe(true);
  });

  it("throws FORBIDDEN for non-admin users", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    await expect(
      caller.blogPipeline.updateTopicStatus({ id: 1, status: "skipped" })
    ).rejects.toThrow("Admin only");
  });
});

describe("blogPipeline.listPosts", () => {
  it("returns generated posts for admin", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.blogPipeline.listPosts({ limit: 50, offset: 0 });
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]?.status).toBe("published");
    expect(result.posts[0]?.wpPostUrl).toContain("simpleshowing.com");
  });
});

describe("blogPipeline.seedTopics", () => {
  it("seeds topics and returns inserted count", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.blogPipeline.seedTopics({
      topics: [
        { keyword: "real estate agent fees", contentType: "informational", source: "clever", traffic: 3000, kwVolume: 2500 },
        { keyword: "best real estate apps", contentType: "affiliate", source: "houzeo", traffic: 1500, kwVolume: 1200 },
        { keyword: "zillow vs redfin", contentType: "comparison", source: "clever", traffic: 8000, kwVolume: 7000 },
      ],
    });
    expect(result.inserted).toBe(3);
  });
});

describe("blogPipeline.stats", () => {
  it("returns queue stats for admin", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.blogPipeline.stats();
    expect(result).toHaveProperty("pending");
    expect(result).toHaveProperty("used");
    expect(result).toHaveProperty("skipped");
    expect(result).toHaveProperty("totalPosts");
    expect(result).toHaveProperty("publishedPosts");
  });
});

describe("blogPipeline.setupDailyJob", () => {
  it("creates a heartbeat job and returns taskUid", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.blogPipeline.setupDailyJob();
    expect(result).toHaveProperty("taskUid");
    expect(result).toHaveProperty("nextExecutionAt");
  });
});
