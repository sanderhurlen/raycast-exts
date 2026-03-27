import { getPreferenceValues } from "@raycast/api";
import type { PostPayload, PublishResult } from "./types";

interface InstagramPrefs {
  instagramUserId: string;
  instagramAccessToken: string;
}

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

function prefs(): InstagramPrefs {
  return getPreferenceValues<InstagramPrefs>();
}

function buildCaption(payload: PostPayload): string {
  if (payload.tags.length === 0) return payload.text;
  const hashtags = payload.tags.map((t) => `#${t}`).join(" ");
  return `${payload.text}\n\n${hashtags}`;
}

async function createImageContainer(
  userId: string,
  token: string,
  imageUrl: string,
  caption?: string,
  isCarouselItem = false,
): Promise<string> {
  const params = new URLSearchParams({
    image_url: imageUrl,
    access_token: token,
  });
  if (isCarouselItem) {
    params.set("is_carousel_item", "true");
  } else if (caption) {
    params.set("caption", caption);
  }

  const response = await fetch(`${GRAPH_API_BASE}/${userId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Instagram media container creation failed: ${text}`);
  }

  const data = (await response.json()) as { id: string };
  return data.id;
}

async function createCarouselContainer(
  userId: string,
  token: string,
  itemIds: string[],
  caption: string,
): Promise<string> {
  const params = new URLSearchParams({
    media_type: "CAROUSEL",
    children: itemIds.join(","),
    caption,
    access_token: token,
  });

  const response = await fetch(`${GRAPH_API_BASE}/${userId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Instagram carousel container creation failed: ${text}`);
  }

  const data = (await response.json()) as { id: string };
  return data.id;
}

async function publishContainer(userId: string, token: string, creationId: string): Promise<string> {
  const params = new URLSearchParams({
    creation_id: creationId,
    access_token: token,
  });

  const response = await fetch(`${GRAPH_API_BASE}/${userId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Instagram publish failed: ${text}`);
  }

  const data = (await response.json()) as { id: string };
  return data.id;
}

export async function postToInstagram(payload: PostPayload): Promise<PublishResult> {
  const { instagramUserId, instagramAccessToken } = prefs();
  return postToInstagramWithCredentials(payload, instagramUserId, instagramAccessToken);
}

// Separated so the headless script can pass credentials directly
export async function postToInstagramWithCredentials(
  payload: PostPayload,
  userId: string,
  accessToken: string,
): Promise<PublishResult> {
  try {
    if (payload.imageUrls.length === 0) {
      throw new Error("Instagram requires at least one public image URL");
    }

    const caption = buildCaption(payload);
    let creationId: string;

    if (payload.imageUrls.length === 1) {
      creationId = await createImageContainer(userId, accessToken, payload.imageUrls[0], caption);
    } else {
      // Carousel: create item containers first, then the carousel container
      const itemIds = await Promise.all(
        payload.imageUrls.map((url) => createImageContainer(userId, accessToken, url, undefined, true)),
      );
      creationId = await createCarouselContainer(userId, accessToken, itemIds, caption);
    }

    const postId = await publishContainer(userId, accessToken, creationId);
    return {
      platform: "instagram",
      success: true,
      url: `https://www.instagram.com/p/${postId}/`,
    };
  } catch (e) {
    return {
      platform: "instagram",
      success: false,
      error: String(e),
    };
  }
}
