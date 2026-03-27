#!/usr/bin/env node
// Headless script executed by launchd every 5 minutes.
// Publishes any scheduled posts whose time has passed.
// Must NOT import @raycast/api — runs outside the Raycast process.
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const BASE_DIR = path.join(os.homedir(), "Library", "Application Support", "raycast-social-media");
const SCHEDULED_DIR = path.join(BASE_DIR, "scheduled");
const PUBLISHED_DIR = path.join(BASE_DIR, "published");
const CONFIG_PATH = path.join(BASE_DIR, "config.json");
const X_TOKEN_ENDPOINT = "https://api.x.com/2/oauth2/token";
const X_CLIENT_ID = "31793974";

async function refreshXToken(config) {
  if (!config.xRefreshToken) return config;
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: config.xRefreshToken,
    client_id: X_CLIENT_ID,
  });
  const response = await fetch(X_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!response.ok) {
    console.error("Token refresh failed:", await response.text());
    return config;
  }
  const data = await response.json();
  config.xAccessToken = data.access_token;
  if (data.refresh_token) config.xRefreshToken = data.refresh_token;
  config.xTokenExpiresAt = Date.now() + (data.expires_in || 7200) * 1000;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  return config;
}

async function ensureXToken(config) {
  const expired = !config.xTokenExpiresAt || Date.now() > config.xTokenExpiresAt - 60_000;
  if (expired) return refreshXToken(config);
  return config;
}

async function uploadXMedia(accessToken, filePath) {
  const fileBytes = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : ext === ".gif" ? "image/gif" : "image/jpeg";

  const form = new FormData();
  form.append("media", new Blob([fileBytes], { type: mimeType }), path.basename(filePath));

  const response = await fetch("https://upload.twitter.com/1.1/media/upload.json", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  if (!response.ok) throw new Error(`X media upload failed: ${await response.text()}`);
  const data = await response.json();
  return data.media_id_string;
}

async function postToX(payload, config) {
  config = await ensureXToken(config);
  const { xAccessToken } = config;

  const mediaIds = [];
  for (const filePath of payload.imagePaths || []) {
    if (fs.existsSync(filePath)) {
      const id = await uploadXMedia(xAccessToken, filePath);
      mediaIds.push(id);
    }
  }

  const hashtags = (payload.tags || []).map((t) => `#${t}`).join(" ");
  const text = hashtags ? `${payload.text}\n\n${hashtags}` : payload.text;
  const body = { text };
  if (mediaIds.length > 0) body.media = { media_ids: mediaIds };

  const response = await fetch("https://api.x.com/2/tweets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${xAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Tweet failed: ${await response.text()}`);
  const data = await response.json();
  return `https://x.com/i/web/status/${data.data.id}`;
}

async function createIgImageContainer(userId, token, imageUrl, caption, isCarouselItem) {
  const params = new URLSearchParams({ image_url: imageUrl, access_token: token });
  if (isCarouselItem) params.set("is_carousel_item", "true");
  else if (caption) params.set("caption", caption);

  const response = await fetch(`https://graph.facebook.com/v21.0/${userId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!response.ok) throw new Error(`IG container failed: ${await response.text()}`);
  return (await response.json()).id;
}

async function postToInstagram(payload, config) {
  const { instagramUserId: userId, instagramAccessToken: token } = config;
  if (!userId || !token) throw new Error("Instagram credentials not configured");

  const hashtags = (payload.tags || []).map((t) => `#${t}`).join(" ");
  const caption = hashtags ? `${payload.text}\n\n${hashtags}` : payload.text;
  const imageUrls = payload.imageUrls || [];

  if (imageUrls.length === 0) throw new Error("Instagram requires at least one image URL");

  let creationId;
  if (imageUrls.length === 1) {
    creationId = await createIgImageContainer(userId, token, imageUrls[0], caption, false);
  } else {
    const itemIds = await Promise.all(imageUrls.map((url) => createIgImageContainer(userId, token, url, null, true)));
    const carouselParams = new URLSearchParams({
      media_type: "CAROUSEL",
      children: itemIds.join(","),
      caption,
      access_token: token,
    });
    const carouselRes = await fetch(`https://graph.facebook.com/v21.0/${userId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: carouselParams,
    });
    if (!carouselRes.ok) throw new Error(`IG carousel failed: ${await carouselRes.text()}`);
    creationId = (await carouselRes.json()).id;
  }

  const publishParams = new URLSearchParams({ creation_id: creationId, access_token: token });
  const publishRes = await fetch(`https://graph.facebook.com/v21.0/${userId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: publishParams,
  });
  if (!publishRes.ok) throw new Error(`IG publish failed: ${await publishRes.text()}`);
  const postId = (await publishRes.json()).id;
  return `https://www.instagram.com/p/${postId}/`;
}

async function main() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.log("No config.json found — nothing to do");
    return;
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch (e) {
    console.error("Failed to read config.json:", e);
    return;
  }

  if (!fs.existsSync(SCHEDULED_DIR)) return;
  fs.mkdirSync(PUBLISHED_DIR, { recursive: true });

  const files = fs.readdirSync(SCHEDULED_DIR).filter((f) => f.endsWith(".json"));
  const now = new Date();

  for (const file of files) {
    const filePath = path.join(SCHEDULED_DIR, file);
    let post;
    try {
      post = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (e) {
      console.error(`Failed to read ${file}:`, e);
      continue;
    }

    if (post.status !== "pending") continue;
    if (new Date(post.scheduledAt) > now) continue;

    console.log(`Publishing scheduled post ${post.id}...`);
    const results = [];

    if ((post.payload.platforms || []).includes("x") && config.xAccessToken) {
      try {
        const url = await postToX(post.payload, config);
        results.push({ platform: "x", success: true, url });
        console.log(`  X: posted at ${url}`);
      } catch (e) {
        results.push({ platform: "x", success: false, error: String(e) });
        console.error(`  X error:`, e);
      }
    }

    if ((post.payload.platforms || []).includes("instagram") && config.instagramAccessToken) {
      try {
        const url = await postToInstagram(post.payload, config);
        results.push({ platform: "instagram", success: true, url });
        console.log(`  Instagram: posted at ${url}`);
      } catch (e) {
        results.push({ platform: "instagram", success: false, error: String(e) });
        console.error(`  Instagram error:`, e);
      }
    }

    post.results = results;
    post.status = results.every((r) => r.success) ? "published" : "failed";

    fs.writeFileSync(filePath, JSON.stringify(post, null, 2));
    fs.renameSync(filePath, path.join(PUBLISHED_DIR, file));
    console.log(`  Status: ${post.status}`);
  }
}

main().catch((err) => {
  console.error("publish-scheduled fatal error:", err);
  process.exit(1);
});
