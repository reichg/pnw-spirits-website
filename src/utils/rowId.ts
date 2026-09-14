/**
 * One definition of what a valid database row id is, for every surface that
 * receives one from outside: a `[id]` path segment, a `?blogId=` query param, or
 * an `id` field in a JSON body.
 *
 * Its own module under `src/utils/` rather than a home inside any one feature,
 * following the precedent `pagination.ts` set for a shared param contract ("Pagination
 * Math Has One Owner" in `docs/decision-log.md`). The callers are eight API route
 * handlers, two public server components under `app/(pages)` and the classes
 * service contract, and they share nothing else. The two pages are what settle
 * the placement: a server component reaching into `services/` for a parameter
 * parse inverts the dependency direction, and `/blogs/[id]` has no business
 * importing a class-feature module - which is exactly what this parser's
 * previous home in `services/classes/classSchemas.ts` would have forced.
 *
 * Pure, and free of server-only imports, for the same reason `pagination.ts` is:
 * `zod` is isomorphic and declares `sideEffects: false`, so nothing here can drag
 * a server module into a client bundle.
 */

import { z } from "zod";

/**
 * The largest value a Postgres `Int` column holds, and therefore the ceiling on
 * every id in the app.
 *
 * The bound is not cosmetic: a larger number is accepted by JavaScript and by a
 * bare `z.number()`, reaches Prisma, and comes back as a driver out-of-range
 * error rather than a clean 400 - a 500 a caller can trigger with a path segment
 * or a query string. Bounded here, the value can never be one the column cannot
 * hold.
 */
export const MAX_INT4 = 2_147_483_647;

/**
 * A row id that arrives already typed as a number (a JSON body field).
 *
 * `z.number()` alone accepts `31.5`, `-1`, `0` and `1e308`; Prisma then
 * truncates a float to the neighbouring integer row, so a request aimed at
 * "31.5" silently edits row 31.
 */
export const rowIdSchema = z.number().int().positive().max(MAX_INT4);

/**
 * A row id that arrives as raw text - a `[id]` path segment or a query param -
 * which is untrusted and reaches Prisma, a Redis cache key and the logs.
 *
 * The `^[1-9]\d*$` gate is the load-bearing part, and is what makes the piped
 * bounds a ceiling check rather than a redundant one. Coercion alone is not
 * enough: `Number("0x1f")` is 31 and `Number("1e3")` is 1000, so a bare
 * `z.coerce.number().int().positive()` still resolves those spellings onto real
 * rows, which is one row reachable by many URLs. Do not "simplify" the regex
 * away. `parseInt`, the other parser this replaced, is worse again - it reads a
 * leading integer and discards the rest, so `1abc` named row 1.
 *
 * A bare scalar, not an object: an object shape is what invited a
 * `Number(idRaw)` pre-coercion at each call site, and the whole point is that
 * the raw segment must arrive unconverted. Feed it `searchParams.get(...)` or an
 * awaited path param directly; a `null` from an absent query key fails here as a
 * type error rather than coercing to 0.
 */
export const rowIdParamSchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(rowIdSchema);
