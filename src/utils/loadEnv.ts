// This script loads .env.local in development, otherwise falls back to .env
import { logger } from "@/utils/logger";
import { config } from "dotenv";
import { existsSync } from "fs";
import { join } from "path";

const envLocal = join(process.cwd(), ".env.local");
if (process.env.NODE_ENV === "development" && existsSync(envLocal)) {
  logger.info("Loading environment variables from .env.local");
  config({ path: envLocal });
} else {
  config();
}