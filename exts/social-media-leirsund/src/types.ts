export type Platform = "x" | "instagram";

export interface PostPayload {
  text: string;
  imagePaths: string[]; // absolute local file paths — used for X media upload
  imageUrls: string[]; // publicly accessible URLs — required by Instagram Graph API
  platforms: Platform[];
  tags: string[];
}

export interface ScheduledPost {
  id: string; // used as the JSON filename
  scheduledAt: string; // ISO 8601
  createdAt: string;
  payload: PostPayload;
  status: "pending" | "published" | "failed";
  error?: string;
  results?: PublishResult[];
}

export interface PublishResult {
  platform: Platform;
  success: boolean;
  url?: string;
  error?: string;
}

// Stored in config.json for use by the headless publish-scheduled.js script
export interface StoredConfig {
  xAccessToken: string;
  xRefreshToken?: string;
  xTokenExpiresAt?: number; // unix timestamp ms
  instagramUserId: string;
  instagramAccessToken: string;
  nodePath?: string; // path to node binary, captured at schedule-time
}
