import { prisma } from "@/lib/db/prisma";

export type AnalyticsSnapshot = {
  avgResponseTimeHours: number | null;
  pendingByAgeBucket: { bucket: string; count: number }[];
  commitmentsOnTimePercentage: number | null;
};

export async function getAnalyticsSnapshot(): Promise<AnalyticsSnapshot> {
  const [approvedDrafts, pendingEmails, completedCommitments, overdueCommitments] = await Promise.all([
    prisma.draft.findMany({
      where: { status: "APPROVED", approvedAt: { not: null } },
      include: { email: true },
    }),
    prisma.email.findMany({ where: { status: { not: "ARCHIVED" } }, select: { receivedAt: true } }),
    prisma.commitment.count({ where: { status: "COMPLETED" } }),
    prisma.commitment.count({ where: { status: "OVERDUE" } }),
  ]);

  const avgResponseTimeHours = approvedDrafts.length
    ? approvedDrafts.reduce((sum, d) => {
        const hours = (d.approvedAt!.getTime() - d.email.receivedAt.getTime()) / (1000 * 60 * 60);
        return sum + hours;
      }, 0) / approvedDrafts.length
    : null;

  const now = Date.now();
  const buckets = [
    { bucket: "< 1 día", max: 24 },
    { bucket: "1-3 días", max: 72 },
    { bucket: "3-7 días", max: 168 },
    { bucket: "> 7 días", max: Infinity },
  ];
  const pendingByAgeBucket = buckets.map((b) => ({ bucket: b.bucket, count: 0 }));
  for (const email of pendingEmails) {
    const ageHours = (now - email.receivedAt.getTime()) / (1000 * 60 * 60);
    const idx = buckets.findIndex((b) => ageHours < b.max);
    pendingByAgeBucket[idx === -1 ? buckets.length - 1 : idx].count++;
  }

  const totalResolved = completedCommitments + overdueCommitments;
  const commitmentsOnTimePercentage = totalResolved > 0 ? (completedCommitments / totalResolved) * 100 : null;

  return { avgResponseTimeHours, pendingByAgeBucket, commitmentsOnTimePercentage };
}
