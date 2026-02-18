// API route for /api/videos

import { logger } from "@/utils/logger";
import redis from "@/utils/redisClient";
import { NextRequest, NextResponse } from "next/server";

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
    const channelId =
      searchParams.get("channelId") || process.env.YOUTUBE_CHANNEL_ID;
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!channelId || !apiKey) {
      logger.error("Missing channelId or API key", {
        context: "/api/videos",
        data: { channelId, apiKeyPresent: !!apiKey },
      });
      return NextResponse.json(
        { error: "Missing channelId or API key" },
        { status: 400 },
      );
    }
    // Pagination support
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "9", 10);
    const maxResults = 50; // YouTube API max per request
    const cacheKey = `yt-videos:${channelId}:maxResults${maxResults}`;
    const cached = await redis.get(cacheKey);
    let allVideos;
    if (cached) {
      logger.info("YouTube videos cache hit (redis)", {
        context: "/api/videos",
        data: { channelId, maxResults },
      });
      allVideos = JSON.parse(cached);
    } else {
      logger.info("YouTube videos cache miss, fetching (redis)", {
        context: "/api/videos",
        data: { channelId, maxResults },
      });
      const url = `https://www.googleapis.com/youtube/v3/search?key=${apiKey}&channelId=${channelId}&part=snippet,id&order=date&maxResults=${maxResults}`;
      const res = await fetch(url);
      if (!res.ok) {
        const errorText = await res.text();
        logger.error("YouTube API fetch failed", {
          context: "/api/videos",
          data: { status: res.status, statusText: res.statusText, errorText },
        });
        return NextResponse.json(
          {
            error: "Failed to fetch videos",
            status: res.status,
            statusText: res.statusText,
            errorText,
          },
          { status: 500 },
        );
      }
      const data = await res.json();
      allVideos = (data.items || [])
        .filter(
          (item: YouTubeAPIItem) =>
            item.id &&
            (typeof item.id === "string" ||
              item.id.videoId ||
              item.id.playlistId),
        )
        .map((item: YouTubeAPIItem) => {
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
      totalPages: Math.ceil(allVideos.length / pageSize),
    });
  } catch (err) {
    logger.error("Unexpected error in /api/videos", {
      context: "/api/videos",
      data: { error: (err as Error).message },
    });
    return NextResponse.json(
      { error: "Unexpected error", details: (err as Error).message },
      { status: 501 },
    );
  }
}
