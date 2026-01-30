// API route for /api/videos
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  // --- DUMMY DATA FOR DEVELOPMENT ---
  const videos = [
    {
      id: "dQw4w9WgXcQ",
      title: "Never Gonna Give You Up",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      publishedAt: "1987-10-25T00:00:00Z",
    },
    {
      id: "3JZ_D3ELwOQ",
      title: "a-ha - Take On Me (Official Video)",
      url: "https://www.youtube.com/watch?v=3JZ_D3ELwOQ",
      thumbnail: "https://img.youtube.com/vi/3JZ_D3ELwOQ/hqdefault.jpg",
      publishedAt: "1985-01-01T00:00:00Z",
    },
    {
      id: "Zi_XLOBDo_Y",
      title: "Michael Jackson - Billie Jean (Official Video)",
      url: "https://www.youtube.com/watch?v=Zi_XLOBDo_Y",
      thumbnail: "https://img.youtube.com/vi/Zi_XLOBDo_Y/hqdefault.jpg",
      publishedAt: "1983-01-02T00:00:00Z",
    },
  ];
  return NextResponse.json({ videos });

  /*
  // --- ORIGINAL YOUTUBE API LOGIC ---
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
    const maxResults = searchParams.get("maxResults") || "10";
    const url = `https://www.googleapis.com/youtube/v3/search?key=${apiKey}&channelId=${channelId}&part=snippet,id&order=date&maxResults=${maxResults}`;
    logger.info("Fetching YouTube videos", {
      context: "/api/videos",
      data: { url, channelId, apiKeyPresent: !!apiKey },
    });
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
    // Map YouTube API response to expected frontend format
    const videos = (data.items || [])
      .filter(
        (item: YouTubeAPIItem) =>
          item.id && (item.id.videoId || item.id.playlistId),
      )
      .map((item: YouTubeAPIItem) => {
        const id = item.id.videoId || item.id.playlistId || item.id;
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
    logger.info("Fetched YouTube videos successfully", {
      context: "/api/videos",
      data: { count: videos.length },
    });
    return NextResponse.json({ videos });
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
  */
}
