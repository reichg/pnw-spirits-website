import { ensureDefaultAdmin } from "@/services/admin/adminService";
import { logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const CONTEXT = "seed";

/**
 * Prisma seed entrypoint.
 *
 * Idempotently provisions the default admin by delegating to the shared
 * service (no-clobber upsert). Business logic stays in services/ (Standard C);
 * the seed only orchestrates the call and process lifecycle. Safe to run
 * repeatedly and across deployments.
 */
async function main(): Promise<void> {
  await ensureDefaultAdmin();
  logger.info("Default admin ensured", { context: CONTEXT });
}

main()
  .catch((error) => {
    logger.error("Seed failed", { context: CONTEXT, data: String(error) });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
