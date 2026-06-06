/**
 * Schedules three one-time Heartbeat jobs for payment reminders:
 * - Day 3 after publication: first reminder
 * - Day 5 after publication: second reminder
 * - Day 7 after publication: final notice + auto-unpublish
 *
 * Uses empty userSession so jobs are created under the project owner identity.
 * NOTE: Heartbeat crons require the site to be deployed. In dev, the jobs are
 * created but will fail to reach the dev URL — this is expected.
 */
import { createHeartbeatJob } from "./_core/heartbeat";

/** Convert a Date to a 6-field cron expression for a one-time run at that exact UTC time. */
function dateToCron(d: Date): string {
  const sec = d.getUTCSeconds();
  const min = d.getUTCMinutes();
  const hour = d.getUTCHours();
  const dom = d.getUTCDate();
  const mon = d.getUTCMonth() + 1; // 1-indexed
  return `${sec} ${min} ${hour} ${dom} ${mon} *`;
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export async function schedulePaymentReminders(
  submissionId: number,
  publishedAt: Date
): Promise<{ day3: string; day5: string; day7: string }> {
  const day3Date = addDays(publishedAt, 3);
  const day5Date = addDays(publishedAt, 5);
  const day7Date = addDays(publishedAt, 7);

  // Empty string = project owner identity (no end-user session needed)
  const [job3, job5, job7] = await Promise.all([
    createHeartbeatJob({
      name: `payment-reminder-d3-${submissionId}`,
      cron: dateToCron(day3Date),
      path: "/api/scheduled/paymentReminder",
      description: `Day-3 payment reminder for submission #${submissionId}`,
    }, ""),
    createHeartbeatJob({
      name: `payment-reminder-d5-${submissionId}`,
      cron: dateToCron(day5Date),
      path: "/api/scheduled/paymentReminder",
      description: `Day-5 payment reminder for submission #${submissionId}`,
    }, ""),
    createHeartbeatJob({
      name: `payment-reminder-d7-${submissionId}`,
      cron: dateToCron(day7Date),
      path: "/api/scheduled/paymentReminder",
      description: `Day-7 final notice + unpublish for submission #${submissionId}`,
    }, ""),
  ]);

  return { day3: job3.taskUid, day5: job5.taskUid, day7: job7.taskUid };
}
