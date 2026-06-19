import { ensureDefaultAdmin } from "@/services/admin/adminService";
import { seedClassPage } from "@/services/classes/classSeed";
import { logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const CONTEXT = "seed";

/**
 * Prisma seed entrypoint.
 *
 * Idempotently provisions the default admin and the class page by delegating
 * to shared services (no-clobber). Business logic stays in services/
 * (Standard C); the seed only orchestrates the calls and process lifecycle.
 * Safe to run repeatedly and across deployments.
 */
async function main(): Promise<void> {
  await ensureDefaultAdmin();
  logger.info("Default admin ensured", { context: CONTEXT });

  await seedClassPage();
  logger.info("Class page seeded", { context: CONTEXT });
}

main()
  .catch((error) => {
    logger.error("Seed failed", { context: CONTEXT, data: String(error) });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
