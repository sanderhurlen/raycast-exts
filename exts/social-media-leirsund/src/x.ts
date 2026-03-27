import { OAuth } from "@raycast/api";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { StoredConfig } from "./types";

const clientId = "31793974";

export const client = new OAuth.PKCEClient({
  redirectMethod: OAuth.RedirectMethod.Web,
  providerName: "X",
  providerIcon: "x-logo.png",
  description: "Connect your X account…",
});

export async function authorize(): Promise<void> {
  const existingTokens = await client.getTokens();
  if (existingTokens?.accessToken) return;

  const authRequest = await client.authorizationRequest({
    endpoint: "https://x.com/i/oauth2/authorize",
    clientId: clientId,
    scope: "tweet.read tweet.write users.read offline.access",
  });
  const { authorizationCode } = await client.authorize(authRequest);
  const tokens = await fetchTokens(authRequest, authorizationCode);
  await client.setTokens(tokens);
}

export async function fetchTokens(
  authRequest: OAuth.AuthorizationRequest,
  authCode: string,
): Promise<OAuth.TokenResponse> {
  const params = new URLSearchParams();
  params.append("client_id", clientId);
  params.append("code", authCode);
  params.append("code_verifier", authRequest.codeVerifier);
  params.append("grant_type", "authorization_code");
  params.append("redirect_uri", authRequest.redirectURI);

  const response = await fetch("https://api.x.com/2/oauth2/token", { method: "POST", body: params });
  if (!response.ok) {
    console.error("fetch tokens error:", await response.text());
    throw new Error(response.statusText);
  }
  return (await response.json()) as OAuth.TokenResponse;
}

export async function uploadMedia(filePath: string): Promise<string> {
  const tokens = await client.getTokens();
  if (!tokens?.accessToken) throw new Error("Not authenticated with X");

  const fileBytes = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : ext === ".gif" ? "image/gif" : "image/jpeg";

  const form = new FormData();
  form.append("media", new Blob([fileBytes], { type: mimeType }), path.basename(filePath));

  const response = await fetch("https://upload.twitter.com/1.1/media/upload.json", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
    body: form,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`X media upload failed: ${text}`);
  }

  const data = (await response.json()) as { media_id_string: string };
  return data.media_id_string;
}

export async function postTweet(text: string, mediaIds: string[]): Promise<string> {
  const tokens = await client.getTokens();
  if (!tokens?.accessToken) throw new Error("Not authenticated with X");

  const body: Record<string, unknown> = { text };
  if (mediaIds.length > 0) {
    body.media = { media_ids: mediaIds };
  }

  const response = await fetch("https://api.x.com/2/tweets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Tweet failed: ${text}`);
  }

  const data = (await response.json()) as { data: { id: string } };
  return `https://x.com/i/web/status/${data.data.id}`;
}

// Persists tokens to config.json so the headless publish-scheduled.js can use them
export async function saveTokensToConfig(): Promise<void> {
  const tokens = await client.getTokens();
  if (!tokens?.accessToken) return;

  const configDir = path.join(os.homedir(), "Library", "Application Support", "raycast-social-media");
  fs.mkdirSync(configDir, { recursive: true });

  const configPath = path.join(configDir, "config.json");
  const existing: Partial<StoredConfig> = fs.existsSync(configPath)
    ? JSON.parse(fs.readFileSync(configPath, "utf8"))
    : {};

  existing.xAccessToken = tokens.accessToken;
  if (tokens.refreshToken) existing.xRefreshToken = tokens.refreshToken;
  // X OAuth 2.0 tokens expire in 7200 seconds (2 hours)
  existing.xTokenExpiresAt = Date.now() + 7200 * 1000;
  existing.nodePath = process.execPath;

  fs.writeFileSync(configPath, JSON.stringify(existing, null, 2));
}
