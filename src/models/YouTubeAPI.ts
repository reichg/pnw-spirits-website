/* eslint-disable @typescript-eslint/no-explicit-any */
// src/models/YouTubeAPI.ts

export interface YouTubeAPIResponse {
  items: YouTubeAPIItem[];
  nextPageToken?: string;
  prevPageToken?: string;
  pageInfo?: {
    totalResults: number;
    resultsPerPage: number;
  };
}

export interface YouTubeAPIItem {
  id: { videoId?: string; playlistId?: string; [key: string]: any };
  snippet: {
    publishedAt: string;
    channelId: string;
    title: string;
    description: string;
    thumbnails: {
      default?: { url: string; width: number; height: number };
      medium?: { url: string; width: number; height: number };
      high?: { url: string; width: number; height: number };
      [key: string]: any;
    };
    channelTitle: string;
    liveBroadcastContent?: string;
    publishTime?: string;
    [key: string]: any;
  };
  [key: string]: any;
}
