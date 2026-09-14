// API route for /api/videos

import { logger } from "@/utils/logger";
import { paginationParams, totalPagesFor } from "@/utils/pagination";
import redis from "@/utils/redisClient";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/** The shared contract, with this route's own default page size. */
const PaginationParams = paginationParams(9);

/**
 * The optional `?channelId=` override, which is untrusted and reaches two sinks
 * unescaped: the upstream request URL, where an `&` or `=` lets an anonymous
 * caller append query params to a YouTube call authenticated with our key, and
 * the Redis cache key, where an unbounded value lets one caller mint unbounded
 * ten-minute entries. Real channel ids are `UC` plus 22 base64url characters;
 * the bound here is looser than that so a non-standard `YOUTUBE_CHANNEL_ID`
 * still works, and tight enough that neither sink can be steered.
 */
const ChannelId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

/** The shape this route maps into, caches, and serializes back out. */
type VideoSummary = {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  publishedAt: string;
};

type YouTubeAPIItem = {
  id: { videoId?: string; playlistId?: string } | string;
  snippet: {
    title: string;
    publishedAt: string;
    thumbnails?: {
      high?: { url: string };
      medium?: { url: string };
      default?: { url: string };
    };
  };
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    // Absent and malformed collapse into one 400 deliberately: the caller
    // learns that the route cannot serve, not which credential is missing.
    const parsedChannelId = ChannelId.safeParse(
      searchParams.get("channelId") || process.env.YOUTUBE_CHANNEL_ID,
    );
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!parsedChannelId.success || !apiKey) {
      logger.error("Missing or unusable channelId or API key", {
        context: "/api/videos",
        data: {
          channelIdValid: parsedChannelId.success,
          apiKeyPresent: !!apiKey,
        },
      });
      return NextResponse.json(
        { error: "Missing channelId or API key" },
        { status: 400 },
      );
    }
    const channelId = parsedChannelId.data;
    // Pagination support
    const { page, pageSize } = PaginationParams.parse({
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
    });
    const maxResults = 50; // YouTube API max per request
    const cacheKey = `yt-videos:${channelId}:maxResults${maxResults}`;
    const cached = await redis.get(cacheKey);
    let allVideos: VideoSummary[];
    if (cached) {
      logger.info("YouTube videos cache hit (redis)", {
        context: "/api/videos",
        data: { channelId, maxResults },
      });
      const parsed: unknown = JSON.parse(cached);
      // Array-ness is checked; element shape deliberately is not. This key is
      // written by this route alone, so the only producer of a wrong shape is
      // an attacker who already holds Redis write access, and per-element
      // validation would not close what that buys them — matching the same call
      // already made for `ContentLink.href`. The array check earns its place on
      // different grounds: `slice` and `length` below depend on it, so asserting
      // it unchecked would be a lie the types then carry into the response.
      if (Array.isArray(parsed)) {
        allVideos = parsed as VideoSummary[];
      } else {
        logger.error("Discarding malformed cached video list", {
          context: "/api/videos",
          data: { cacheKey, parsedType: typeof parsed },
        });
        allVideos = [];
      }
    } else {
      logger.info("YouTube videos cache miss, fetching (redis)", {
        context: "/api/videos",
        data: { channelId, maxResults },
      });
      const url = `https://www.googleapis.com/youtube/v3/search?key=${apiKey}&channelId=${channelId}&part=snippet,id&order=date&maxResults=${maxResults}`;
      const res = await fetch(url);
      if (!res.ok) {
        // The upstream body never reaches the caller: this endpoint is an
        // unauthenticated public GET, and an error body that echoes the request
        // URL would hand `key=` straight to an anonymous client, while quota and
        // billing detail is not the public's to read either. `url` carries the
        // key verbatim, so the body is redacted and capped before the log sink
        // too, which is the one place it is still allowed to go.
        const errorText = (await res.text())
          .replaceAll(apiKey, "[REDACTED]")
          .slice(0, 500);
        logger.error("YouTube API fetch failed", {
          context: "/api/videos",
          data: { status: res.status, statusText: res.statusText, errorText },
        });
        // 502, not 500: the fault is in a dependency this route proxies, not in
        // the handler. Both consumers branch only on `!res.ok`.
        return NextResponse.json(
          { error: "Failed to fetch videos" },
          { status: 502 },
        );
      }
      const data = (await res.json()) as { items?: YouTubeAPIItem[] };
      allVideos = (data.items ?? [])
        .filter(
          (item) =>
            item.id &&
            (typeof item.id === "string" ||
              item.id.videoId ||
              item.id.playlistId),
        )
        .map((item) => {
          const id =
            typeof item.id === "string"
              ? item.id
              : item.id.videoId || item.id.playlistId || "";
          return {
            id,
            title: item.snippet.title,
            url: `https://www.youtube.com/watch?v=${id}`,
            thumbnail:
              item.snippet.thumbnails?.high?.url ||
              item.snippet.thumbnails?.medium?.url ||
              item.snippet.thumbnails?.default?.url ||
              "",
            publishedAt: item.snippet.publishedAt,
          };
        });
      // Cache for 10 minutes
      await redis.set(cacheKey, JSON.stringify(allVideos), "EX", 10 * 60);
      logger.info("Fetched and cached YouTube videos (redis)", {
        context: "/api/videos",
        data: { count: allVideos.length },
      });
    }
    // Paginate
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginatedVideos = allVideos.slice(start, end);
    return NextResponse.json({
      videos: paginatedVideos,
      total: allVideos.length,
      page,
      pageSize,
      totalPages: totalPagesFor(allVideos.length, pageSize),
    });
  } catch (err) {
    logger.error("Unexpected error in /api/videos", {
      context: "/api/videos",
      data: { error: err instanceof Error ? err.message : String(err) },
    });
    // The message stays in the log: a thrown Redis or fetch error can carry a
    // connection string, a host, or a stack fragment, none of it the caller's.
    // 500 rather than the previous 501, which advertises that the method is
    // unsupported and is heuristically cacheable per RFC 9110 — the wrong thing
    // for a transient failure an intermediary might then pin for everyone.
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
