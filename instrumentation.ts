export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startAutoScanScheduler } = await import("@/lib/scheduler/auto-scan");
  startAutoScanScheduler();

  const { startAutoDigestScheduler } = await import("@/lib/scheduler/auto-digest");
  startAutoDigestScheduler();
}
