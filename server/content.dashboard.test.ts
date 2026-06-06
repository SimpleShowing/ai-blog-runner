/**
 * SimpleShowing AI Content Dashboard — Unit Tests
 *
 * Tests cover:
 *  1. auth.logout — session cookie cleared (template baseline)
 *  2. topics router — create, list, approve, pause, delete
 *  3. drafts router — update, submitForReview, approve, reject
 *  4. qa router — run checks on a well-formed vs sparse draft
 *  5. comments router — create and resolve
 *  6. settings router — getAll masks wp_app_password; update is admin-only
 *  7. editors router — invite and list are admin-only
 *
 * All DB calls are mocked via vi.mock so no real database is needed.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";

// ─── Mock all DB helpers ──────────────────────────────────────────────────────

vi.mock("./db", () => ({
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
  getTopics: vi.fn(async () => []),
  getTopicById: vi.fn(async (id: number) => ({
    id,
    title: "Test Topic",
    status: "idea",
    contentPillar: "buyer-guide",
    targetMarket: "Atlanta GA",
    conversionGoal: "home-valuation",
    priority: "medium",
    keyword: "buy a home",
    notes: "",
    assignedTo: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
  createTopic: vi.fn(async () => 42),
  updateTopic: vi.fn(async () => {}),
  deleteTopic: vi.fn(async () => {}),
  getBriefByTopicId: vi.fn(async () => null),
  getBriefById: vi.fn(async () => null),
  createBrief: vi.fn(async () => 1),
  updateBrief: vi.fn(async () => {}),
  getDraftsByTopicId: vi.fn(async () => []),
  getDraftById: vi.fn(async (id: number) => ({
    id,
    topicId: 1,
    title: "10 Ways to Save on Real Estate Commissions",
    content:
      "This is a long article about saving on real estate commissions. " +
      "SimpleShowing.com helps you save. See how much you can save. " +
      "According to NAR, the average commission is 5-6%. " +
      "Use href=\"/blog/related\" for more. ".repeat(100),
    excerpt: "Save money on commissions with SimpleShowing.",
    seoTitle: "10 Ways to Save on Real Estate Commissions | SimpleShowing",
    metaDescription:
      "Discover 10 proven ways to save on real estate commissions. SimpleShowing helps buyers and sellers keep more money.",
    focusKeyword: "save on real estate commissions",
    canonicalUrl: "/blog/save-on-real-estate-commissions",
    categories: "Buyer Guide",
    tags: "commissions, savings",
    status: "draft",
    slug: "save-on-real-estate-commissions",
    wpPostId: null,
    wpPostUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
  getAllDrafts: vi.fn(async () => []),
  createDraft: vi.fn(async () => 10),
  updateDraft: vi.fn(async () => {}),
  getLatestQaForDraft: vi.fn(async () => null),
  createQaResult: vi.fn(async () => 5),
  getCommentsByDraftId: vi.fn(async () => []),
  createComment: vi.fn(async () => 20),
  resolveComment: vi.fn(async () => {}),
  getWpLogsForDraft: vi.fn(async () => []),
  createWpLog: vi.fn(async () => {}),
  getAllWpLogs: vi.fn(async () => []),
  getSetting: vi.fn(async (key: string) => {
    const store: Record<string, string> = {
      wp_url: "https://www.simpleshowing.com",
      wp_username: "content-agent",
      wp_app_password: "secret-password",
    };
    return store[key] ?? null;
  }),
  getAllSettings: vi.fn(async () => ({
    wp_url: "https://www.simpleshowing.com",
    wp_username: "content-agent",
    wp_app_password: "secret-password",
    brand_voice: "Friendly and expert",
    approved_ctas: "Get a free home valuation, See how much you can save",
    target_markets: "Atlanta GA",
    forbidden_claims: "Guaranteed sale",
    style_guide: "Use second-person.",
  })),
  setSetting: vi.fn(async () => {}),
  setSettings: vi.fn(async () => {}),
  getInvitedEditors: vi.fn(async () => []),
  inviteEditor: vi.fn(async () => {}),
  removeEditor: vi.fn(async () => {}),
  isEmailAllowed: vi.fn(async () => true),
  getAllUsers: vi.fn(async () => []),
}));

// ─── Mock LLM (not tested here) ──────────────────────────────────────────────

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(async () => ({
    choices: [{ message: { content: JSON.stringify({
      title: "AI Title",
      content: "AI content",
      excerpt: "AI excerpt",
      seoTitle: "AI SEO Title",
      metaDescription: "AI meta description that is long enough to pass",
      focusKeyword: "test keyword",
      canonicalUrl: "/blog/test",
      categories: "Test",
      tags: "test",
    }) } }],
  })),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn(async () => true),
}));

// ─── Context helpers ──────────────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 1,
    openId: "owner-open-id",
    email: "owner@simpleshowing.com",
    name: "Owner",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

function makeCtx(user: AuthenticatedUser | null = makeUser()): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Import router after mocks are set up ────────────────────────────────────

const { appRouter } = await import("./routers");

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("auth.logout", () => {
  it("clears the session cookie and returns success", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect((ctx.res.clearCookie as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });
});

describe("topics router", () => {
  it("creates a topic and returns its id", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.topics.create({
      title: "How to Buy a Home in Atlanta",
      contentPillar: "buyer_guides",
      targetMarket: "Atlanta GA",
      conversionGoal: "home_valuation",
      priority: "high",
    });
    expect(result).toEqual({ id: 42 });
  });

  it("approves a topic (admin)", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.topics.approve({ id: 1 });
    expect(result).toEqual({ success: true });
  });

  it("pauses a topic", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.topics.pause({ id: 1 });
    expect(result).toEqual({ success: true });
  });

  it("rejects topic creation when user is not authenticated", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(caller.topics.create({
      title: "Unauthorized Topic",
      contentPillar: "buyer-guide",
      targetMarket: "Atlanta GA",
      conversionGoal: "home-valuation",
      priority: "medium",
    })).rejects.toThrow(TRPCError);
  });
});

describe("drafts router", () => {
  it("updates a draft and returns success", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.drafts.update({
      id: 10,
      title: "Updated Title",
      topicId: 1,
    });
    expect(result).toEqual({ success: true });
  });

  it("submits a draft for review and notifies owner", async () => {
    const { notifyOwner } = await import("./_core/notification");
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.drafts.submitForReview({ id: 10, topicId: 1 });
    expect(result).toEqual({ success: true });
    expect(notifyOwner).toHaveBeenCalledWith(expect.objectContaining({
      title: expect.stringContaining("Review"),
    }));
  });

  it("approves a draft (any authenticated user)", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser({ role: "user" })));
    const result = await caller.drafts.approve({ id: 10, topicId: 1 });
    expect(result).toEqual({ success: true });
  });

  it("rejects a draft with a reason", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.drafts.reject({ id: 10, topicId: 1, reason: "Needs more citations" });
    expect(result).toEqual({ success: true });
  });
});

describe("qa router", () => {
  it("runs QA on a well-formed draft and returns pass/warn results", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.qa.run({ draftId: 10 });
    expect(result).toHaveProperty("qaId");
    expect(result).toHaveProperty("overallStatus");
    expect(result).toHaveProperty("wordCount");
    expect(result).toHaveProperty("readabilityScore");
    expect(["pass", "warn", "fail"]).toContain(result.overallStatus);
  });

  it("returns fail overall status for a draft with no content", async () => {
    const { getDraftById } = await import("./db");
    (getDraftById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 99,
      topicId: 1,
      title: "",
      content: "",
      excerpt: "",
      seoTitle: "",
      metaDescription: "",
      focusKeyword: "",
      canonicalUrl: "",
      categories: "",
      tags: "",
      status: "draft",
      slug: null,
      wpPostId: null,
      wpPostUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.qa.run({ draftId: 99 });
    expect(result.overallStatus).toBe("fail");
  });
});

describe("comments router", () => {
  it("creates a comment on a draft", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.comments.create({
      draftId: 10,
      content: "Please add a section on buyer rebates.",
      type: "revision_request",
    });
    expect(result).toEqual({ id: 20 });
  });

  it("resolves a comment", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.comments.resolve({ id: 20 });
    expect(result).toEqual({ success: true });
  });
});

describe("settings router", () => {
  it("getAll masks the wp_app_password before returning to the browser", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const settings = await caller.settings.getAll();
    expect(settings["wp_app_password"]).toBe("••••••••");
    expect(settings["wp_url"]).toBe("https://www.simpleshowing.com");
  });

  it("update is admin-only — rejects non-admin users", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser({ role: "user" })));
    await expect(caller.settings.update({ wp_url: "https://evil.com" })).rejects.toThrow(TRPCError);
  });

  it("update succeeds for admin", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.settings.update({ brand_voice: "Professional and clear." });
    expect(result).toEqual({ success: true });
  });
});

describe("editors router", () => {
  it("list is admin-only — rejects non-admin", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser({ role: "user" })));
    await expect(caller.editors.list()).rejects.toThrow(TRPCError);
  });

  it("invite is admin-only — rejects non-admin", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser({ role: "user" })));
    await expect(caller.editors.invite({ email: "editor@test.com", name: "Test Editor" })).rejects.toThrow(TRPCError);
  });

  it("admin can invite an editor", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.editors.invite({ email: "editor@test.com", name: "Test Editor" });
    expect(result).toEqual({ success: true });
  });

  it("admin can list editors", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.editors.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── stripLeadingH1 helper (tested via wordpress.push) ───────────────────────

describe("stripLeadingH1 (via wordpress.push content)", () => {
  // Local copy of the helper for unit testing
  function stripLeadingH1(content: string): string {
    let c = content.replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>\s*/i, "");
    c = c.replace(/^\s*#(?!#)[^\n]*\n?/, "");
    return c.trim();
  }

  it("strips a plain HTML <h1> at the start", () => {
    expect(stripLeadingH1("<h1>My Title</h1>\n<p>Body</p>")).toBe("<p>Body</p>");
  });

  it("strips a markdown # heading at the start", () => {
    expect(stripLeadingH1("# My Title\nBody text")).toBe("Body text");
  });

  it("does NOT strip ## or ### headings", () => {
    const input = "## Section\nBody text";
    expect(stripLeadingH1(input)).toBe(input);
  });

  it("does NOT strip an <h1> that is not at the start", () => {
    const input = "<p>Intro</p>\n<h1>Title</h1>\n<p>Body</p>";
    expect(stripLeadingH1(input)).toBe(input);
  });

  it("strips leading whitespace before the h1", () => {
    expect(stripLeadingH1("  <h1>Title</h1>\n<p>Body</p>")).toBe("<p>Body</p>");
  });

  it("returns empty string when content is only an h1", () => {
    expect(stripLeadingH1("<h1>Only Title</h1>")).toBe("");
  });

  it("handles multi-line h1 content", () => {
    expect(stripLeadingH1("<h1>\n  Title\n</h1>\n<p>Body</p>")).toBe("<p>Body</p>");
  });

  it("strips <H1> (uppercase tag)", () => {
    expect(stripLeadingH1("<H1>Title</H1>\n<p>Body</p>")).toBe("<p>Body</p>");
  });
});

// ─── Top-level mocks for WP push tests (hoisted before appRouter import) ─────

vi.mock("./_core/imageGeneration", () => ({
  generateImage: vi.fn(async () => ({ url: "/manus-storage/generated/test_abc.png" })),
}));
vi.mock("./storage", () => ({
  storagePut: vi.fn(async () => ({ key: "test_key", url: "/manus-storage/test_key" })),
  storageGet: vi.fn(async () => ({ key: "test_key", url: "/manus-storage/test_key" })),
  storageGetSignedUrl: vi.fn(async () => "https://s3.example.com/img.png"),
}));

// ─── wordpress.push: notification includes WP URL ────────────────────────────

// Top-level imports for WP push describe block (top-level await is allowed here)
const _wpPushDbMod = await import("./db");
const _wpPushNotifMod = await import("./_core/notification");
const _wpPushLlmMod = await import("./_core/llm");
const _wpPushImgMod = await import("./_core/imageGeneration");

describe("wordpress.push", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Restore getSetting mock
    (_wpPushDbMod.getSetting as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
      const store: Record<string, string> = {
        wp_url: "https://www.simpleshowing.com",
        wp_username: "content-agent",
        wp_app_password: "secret-password",
      };
      return store[key] ?? null;
    });
    // Restore getDraftById mock with approved status
    (_wpPushDbMod.getDraftById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 55,
      topicId: 1,
      title: "Georgia HEAR Program Guide",
      content: "<h1>Georgia HEAR Program Guide</h1><p>Body content here.</p>",
      excerpt: "Learn about the Georgia HEAR program for home energy upgrades.",
      seoTitle: "Georgia HEAR Program | SimpleShowing",
      metaDescription: "Everything you need to know about the Georgia HEAR program.",
      focusKeyword: "georgia hear program",
      canonicalUrl: "/blog/georgia-hear-program",
      status: "approved",
    });
    // Restore invokeLLM to return category suggestions
    (_wpPushLlmMod.invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ categories: ["Electrical", "Home Improvement"] }) } }],
    });
    // Restore imageGeneration mock
    (_wpPushImgMod.generateImage as ReturnType<typeof vi.fn>).mockResolvedValue({
      url: "/manus-storage/generated/test_abc.png",
    });
  });

  it("strips the leading H1 from content before pushing to WordPress", async () => {
    const caller = appRouter.createCaller(makeCtx());

    let capturedBody: Record<string, unknown> | undefined;
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async (url: string | URL | Request, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes("s3.example.com")) {
        return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as Response;
      }
      if (urlStr.includes("/wp-json/wp/v2/categories")) {
        return { ok: true, json: async () => [] } as Response;
      }
      if (urlStr.includes("/wp-json/wp/v2/media")) {
        return { ok: true, json: async () => ({ id: 999 }) } as Response;
      }
      if (urlStr.includes("/wp-json/wp/v2/posts")) {
        capturedBody = JSON.parse((opts?.body as string) || "{}");
        return { ok: true, json: async () => ({ id: 13509, link: "https://www.simpleshowing.com/?p=13509" }) } as Response;
      }
      return { ok: false, json: async () => ({}), text: async () => "" } as Response;
    }) as unknown as typeof fetch;

    try {
      await caller.wordpress.push({ draftId: 55, topicId: 1, wpPostStatus: "draft" });
      expect(capturedBody?.content).toBeDefined();
      expect(String(capturedBody?.content)).not.toMatch(/^<h1/i);
      expect(String(capturedBody?.content)).toContain("<p>Body content here.</p>");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("includes the live WP post URL in the owner notification", async () => {
    const caller = appRouter.createCaller(makeCtx());

    const originalFetch = global.fetch;
    global.fetch = vi.fn(async (url: string | URL | Request, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes("s3.example.com")) {
        return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as Response;
      }
      if (urlStr.includes("/wp-json/wp/v2/categories")) {
        return { ok: true, json: async () => [] } as Response;
      }
      if (urlStr.includes("/wp-json/wp/v2/media")) {
        return { ok: true, json: async () => ({ id: 999 }) } as Response;
      }
      if (urlStr.includes("/wp-json/wp/v2/posts")) {
        return { ok: true, json: async () => ({ id: 13509, link: "https://www.simpleshowing.com/?p=13509" }) } as Response;
      }
      return { ok: false, json: async () => ({}), text: async () => "" } as Response;
    }) as unknown as typeof fetch;

    try {
      await caller.wordpress.push({ draftId: 55, topicId: 1, wpPostStatus: "draft" });
      expect(_wpPushNotifMod.notifyOwner).toHaveBeenCalledWith(expect.objectContaining({
        title: "Post Published to WordPress",
        content: expect.stringContaining("https://www.simpleshowing.com/?p=13509"),
      }));
    } finally {
      global.fetch = originalFetch;
    }
  });
});
