import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { execSync } from "child_process";
import type { PostPayload, ScheduledPost, StoredConfig } from "./types";
import { getPreferenceValues } from "@raycast/api";

interface InstagramPrefs {
  instagramUserId: string;
  instagramAccessToken: string;
}

export const BASE_DIR = path.join(os.homedir(), "Library", "Application Support", "raycast-social-media");
const SCHEDULED_DIR = path.join(BASE_DIR, "scheduled");
const PUBLISHED_DIR = path.join(BASE_DIR, "published");
const CONFIG_PATH = path.join(BASE_DIR, "config.json");
const PLIST_PATH = path.join(os.homedir(), "Library", "LaunchAgents", "com.raycast.social-media.plist");

export function ensureDirs(): void {
  fs.mkdirSync(SCHEDULED_DIR, { recursive: true });
  fs.mkdirSync(PUBLISHED_DIR, { recursive: true });
}

export function schedulePost(payload: PostPayload, scheduledAt: Date, assetsPath: string): ScheduledPost {
  ensureDirs();

  const post: ScheduledPost = {
    id: crypto.randomUUID(),
    scheduledAt: scheduledAt.toISOString(),
    createdAt: new Date().toISOString(),
    payload,
    status: "pending",
  };

  const filePath = path.join(SCHEDULED_DIR, `${post.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(post, null, 2));

  // Update config.json with Instagram credentials and node path for the headless script
  updateConfig(assetsPath);
  registerLaunchdPlist(assetsPath);

  return post;
}

export function listScheduledPosts(): ScheduledPost[] {
  ensureDirs();
  if (!fs.existsSync(SCHEDULED_DIR)) return [];

  return fs
    .readdirSync(SCHEDULED_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(SCHEDULED_DIR, f), "utf8")) as ScheduledPost)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

export function deleteScheduledPost(id: string): void {
  const filePath = path.join(SCHEDULED_DIR, `${id}.json`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

function updateConfig(assetsPath: string): void {
  const prefs = getPreferenceValues<InstagramPrefs>();
  const existing: Partial<StoredConfig> = fs.existsSync(CONFIG_PATH)
    ? JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"))
    : {};

  existing.instagramUserId = prefs.instagramUserId;
  existing.instagramAccessToken = prefs.instagramAccessToken;
  existing.nodePath = process.execPath;

  // Store the path to the headless script (in assets/ so it survives ray build)
  const scriptPath = path.join(assetsPath, "publish-scheduled.js");
  (existing as Record<string, unknown>).scriptPath = scriptPath;

  fs.mkdirSync(BASE_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(existing, null, 2));
}

function registerLaunchdPlist(assetsPath: string): void {
  const scriptPath = path.join(assetsPath, "publish-scheduled.js");
  const nodePath = process.execPath;

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.raycast.social-media</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${scriptPath}</string>
  </array>
  <key>StartInterval</key>
  <integer>300</integer>
  <key>StandardOutPath</key>
  <string>${BASE_DIR}/launchd.log</string>
  <key>StandardErrorPath</key>
  <string>${BASE_DIR}/launchd-error.log</string>
</dict>
</plist>`;

  fs.writeFileSync(PLIST_PATH, plistContent);

  // Unload first (ignore errors if not loaded), then load fresh
  try {
    execSync(`launchctl unload "${PLIST_PATH}" 2>/dev/null || true`, { stdio: "ignore" });
  } catch (_) {
    // ignore
  }
  try {
    execSync(`launchctl load "${PLIST_PATH}"`, { stdio: "ignore" });
  } catch (e) {
    console.error("Failed to register launchd plist:", e);
  }
}
