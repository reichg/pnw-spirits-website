// This script loads .env.local in development, otherwise falls back to .env
import { config } from "dotenv";
import { existsSync } from "fs";
import { join } from "path";

const envLocal = join(process.cwd(), ".env.local");
if (process.env.NODE_ENV === "development" && existsSync(envLocal)) {
  config({ path: envLocal });
} else {
  config();
}
