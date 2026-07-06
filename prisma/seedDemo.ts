import { seedDemoData } from "@/services/demo/demoSeedService";
import { logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import redis from "@/utils/redisClient";

const CONTEXT = "seedDemo";

/**
 * Demo/placeholder seed entrypoint.
 *
 * Delegates all content and write logic to seedDemoData (Standard C); this file
 * only orchestrates the call and process lifecycle. The service refuses to run
 * when NODE_ENV is "production" and is safe to run repeatedly (sentinel-based
 * idempotency). Run via `tsx prisma/seedDemo.ts`.
 */
async function main(): Promise<void> {
  await seedDemoData();
  logger.info("Demo seed complete", { context: CONTEXT });
}

main()
  .catch((error) => {
    logger.error("Demo seed failed", { context: CONTEXT, data: String(error) });
    process.exitCode = 1;
  })
  .finally(async () => {
    // The service (transitively) imports redisClient, which opens an ioredis
    // connection at module load. Close both clients independently so a failing
    // quit can't mask disconnect and the process always exits cleanly.
    await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  });
