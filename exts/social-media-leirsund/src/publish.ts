import { authorize, uploadMedia, postTweet, saveTokensToConfig } from "./x";
import { postToInstagram } from "./instagram";
import type { PostPayload, PublishResult } from "./types";

function buildXText(payload: PostPayload): string {
  if (payload.tags.length === 0) return payload.text;
  const hashtags = payload.tags.map((t) => `#${t}`).join(" ");
  return `${payload.text}\n\n${hashtags}`;
}

export async function publishPost(payload: PostPayload): Promise<PublishResult[]> {
  const results: PublishResult[] = [];

  if (payload.platforms.includes("x")) {
    try {
      await authorize();
      await saveTokensToConfig(); // keep config.json fresh for scheduled posts

      const mediaIds: string[] = [];
      for (const filePath of payload.imagePaths) {
        const id = await uploadMedia(filePath);
        mediaIds.push(id);
      }

      const text = buildXText(payload);
      const url = await postTweet(text, mediaIds);
      results.push({ platform: "x", success: true, url });
    } catch (e) {
      results.push({ platform: "x", success: false, error: String(e) });
    }
  }

  if (payload.platforms.includes("instagram")) {
    results.push(await postToInstagram(payload));
  }

  return results;
}
