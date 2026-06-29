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

/**
 * Invalidate all blog cache keys (keys starting with 'blogs:').
 * Used after any blog mutation (create, update, delete).
 */
export async function invalidateBlogCache() {
  const keys = await redis.keys("blogs:*");
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

/**
 * Invalidate all class cache keys (keys starting with 'classes:').
 * Used after any class-page mutation (content, sessions, photos).
 */
export async function invalidateClassCache() {
  const keys = await redis.keys("classes:*");
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

export default redis;
