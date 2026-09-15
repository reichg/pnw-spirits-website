import { describe, expect, it } from "vitest";

import {
  isAllowedUploadContentType,
  UPLOAD_IMAGE_CONTENT_TYPES,
} from "./mediaSchemas";

describe("UPLOAD_IMAGE_CONTENT_TYPES", () => {
  // Shared by /api/uploads and /api/s3-signed-url. Pinned because widening this
  // list widens BOTH upload paths at once, including the in-process one that is
  // deliberately image-only.
  it("is exactly the four still-image types both upload paths accept", () => {
    expect([...UPLOAD_IMAGE_CONTENT_TYPES].sort()).toEqual([
      "image/gif",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
  });

  it("excludes SVG, which can carry script", () => {
    expect(UPLOAD_IMAGE_CONTENT_TYPES).not.toContain("image/svg+xml");
  });
});

describe("isAllowedUploadContentType", () => {
  it("accepts every shared still-image type", () => {
    for (const contentType of UPLOAD_IMAGE_CONTENT_TYPES) {
      expect(isAllowedUploadContentType(contentType)).toBe(true);
    }
  });

  it("accepts video by family, matching the editors' accept attribute", () => {
    expect(isAllowedUploadContentType("video/mp4")).toBe(true);
    expect(isAllowedUploadContentType("video/quicktime")).toBe(true);
  });

  // The point of the allowlist: nothing a browser will render as a document.
  it.each([
    "text/html",
    "image/svg+xml",
    "application/xhtml+xml",
    "text/plain",
    "",
  ])("rejects %s", (contentType) => {
    expect(isAllowedUploadContentType(contentType)).toBe(false);
  });
});
