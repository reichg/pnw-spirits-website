# Decision Log

## 2026-02-22: Recipe Search Feature Added

### Summary

Implemented recipe search functionality across API and UI. Users can now search for recipes by name, ingredient, or tags.

### API Contract Change

- Added `/api/recipes/search` endpoint.
- Accepts query parameters: `q` (string, search term), `ingredients` (array), `tags` (array).
- Returns filtered recipe list with relevant metadata.
- Input validated with zod; output conforms to new recipe search schema.

### UI Accessibility Improvements

- Search input labeled and keyboard accessible.
- Results list uses semantic HTML and ARIA roles.
- Focus management and clear error messages for invalid input.

### Rationale

Enhances user experience and discoverability. API contract change required to support flexible search. Accessibility improvements ensure inclusivity.

---

## 2026-02-22: Recipe Cache Invalidation

- Implemented cache invalidation for recipes on create, update, and delete operations.
- Ensures users always see the latest recipe data and prevents stale cache issues.
- Backend logic: After any recipe mutation (create, update, delete), the relevant cache entries are cleared. This is handled in the server action or API route responsible for the mutation.
- Regression tests added to verify cache is properly invalidated and rebuilt after each mutation.

---

## 2026-02-22: Direct-to-S3 Media Uploads

### Summary

Switched media (cover and content) uploads in the admin recipe editor to use direct-to-S3 uploads via signed URLs, bypassing Vercel's 4.5MB payload limit. This enables uploads of files up to S3's limits (e.g., 15MB+), improving reliability for large files.

### API Contract Change

- `/api/s3-signed-url` now supports POST for generating signed S3 PUT URLs for uploads. Request: `{ key, contentType }`. Response: `{ url }`.

### UI/UX Change

- Admin recipe editor now uploads files directly to S3 from the browser, instead of proxying through `/api/uploads`.
- Progress and error handling remain unchanged for users.

### Security

- S3 credentials are never exposed to the client; only signed URLs are used.
- File type and size validation should be enforced client-side and/or in S3 bucket policy.

### Follow-up

- Consider removing `/api/uploads` if no longer needed.
- Add E2E tests for large file uploads.
