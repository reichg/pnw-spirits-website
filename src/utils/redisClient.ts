// Redis client utility for caching
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

/**
 * Invalidate all recipe cache keys (keys starting with 'recipes:').
 * Used after any recipe mutation (create, update, delete).
 */
export async function invalidateRecipeCache() {
  const keys = await redis.keys("recipes:*");
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

export default redis;
