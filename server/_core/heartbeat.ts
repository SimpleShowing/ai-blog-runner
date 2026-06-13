/**
 * heartbeat.ts — Manus Heartbeat replaced by Railway Cron.
 *
 * Railway cron sends a POST to /api/scheduled/blogPostGenerator with the
 * header `x-cron-secret: <CRON_SECRET>` on the schedule you configure
 * in the Railway dashboard (e.g. "0 8 * * *" for 8am UTC daily).
 *
 * All Heartbeat functions are stubbed out so existing callers in routers.ts
 * compile without changes. The blogPipeline.setupDailyJob and
 * blogPipeline.getDailyJobStatus procedures will return graceful no-ops.
 */

export type HeartbeatJob = {
  name: string;
  cron: string;
  path: string;
  method?: "POST" | "PUT";
  payload?: unknown;
  description?: string;
};

export type HeartbeatJobUpdate = Partial<Omit<HeartbeatJob, "name">> & {
  enable?: boolean;
};

export type HeartbeatJobInfo = {
  taskUid: string;
  name: string;
  userId: string;
  description: string;
  cronExpression: string;
  callbackPath: string;
  callbackMethod: string;
  callbackPayload: string;
  isEnable: boolean;
  createdAt?: string | null;
  lastExecutedAt?: string | null;
  nextExecutionAt?: string | null;
};

const RAILWAY_STUB: HeartbeatJobInfo = {
  taskUid: "railway-cron",
  name: "daily-blog-generator",
  userId: "system",
  description: "Daily blog post generation — managed by Railway Cron (not Manus Heartbeat)",
  cronExpression: "0 8 * * *",
  callbackPath: "/api/scheduled/blogPostGenerator",
  callbackMethod: "POST",
  callbackPayload: "{}",
  isEnable: true,
  createdAt: null,
  lastExecutedAt: null,
  nextExecutionAt: null,
};

export async function createHeartbeatJob(
  _job: HeartbeatJob,
  _userSession: string
): Promise<{ taskUid: string; nextExecutionAt?: string | null }> {
  // No-op: cron is configured in Railway dashboard
  return { taskUid: "railway-cron", nextExecutionAt: null };
}

export async function updateHeartbeatJob(
  _taskUid: string,
  _patch: HeartbeatJobUpdate,
  _userSession: string
): Promise<{ nextExecutionAt?: string | null }> {
  return { nextExecutionAt: null };
}

export async function deleteHeartbeatJob(
  _taskUid: string,
  _userSession: string
): Promise<void> {
  // No-op
}

export async function listHeartbeatJobs(
  _userSession: string,
  _pagination?: { page?: number; pageSize?: number }
): Promise<{ total: number; actorUserId: string; jobs: HeartbeatJobInfo[] }> {
  return { total: 1, actorUserId: "system", jobs: [RAILWAY_STUB] };
}
