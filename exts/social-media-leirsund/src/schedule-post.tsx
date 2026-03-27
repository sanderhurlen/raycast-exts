import { Action, ActionPanel, environment, Form, showToast, Toast } from "@raycast/api";
import { useState } from "react";
import z from "zod";
import { schedulePost } from "./scheduler";
import type { Platform, PostPayload } from "./types";

const formSchema = z.object({
  "channel-instagram": z.boolean(),
  "channel-x": z.boolean(),
  content: z.string().min(1, "Content cannot be empty"),
  tags: z.array(z.string()),
  xImages: z.array(z.string()),
  instagramImageUrls: z.string(),
  scheduledAt: z.date({ required_error: "Scheduled time is required" }),
});

export default function Command() {
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(values: unknown) {
    const parsed = formSchema.safeParse(values);
    if (!parsed.success) {
      showToast({ style: Toast.Style.Failure, title: "Validation error", message: parsed.error.issues[0].message });
      return;
    }

    const platforms: Platform[] = [];
    if (parsed.data["channel-x"]) platforms.push("x");
    if (parsed.data["channel-instagram"]) platforms.push("instagram");

    if (platforms.length === 0) {
      showToast({ style: Toast.Style.Failure, title: "No platform selected", message: "Select at least one channel" });
      return;
    }

    const scheduledAt = parsed.data.scheduledAt;
    if (scheduledAt <= new Date()) {
      showToast({ style: Toast.Style.Failure, title: "Invalid time", message: "Scheduled time must be in the future" });
      return;
    }

    const instagramImageUrls = parsed.data.instagramImageUrls
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean);

    const payload: PostPayload = {
      text: parsed.data.content,
      imagePaths: parsed.data.xImages,
      imageUrls: instagramImageUrls,
      platforms,
      tags: parsed.data.tags,
    };

    setIsLoading(true);
    try {
      schedulePost(payload, scheduledAt, environment.assetsPath);
      const formatted = scheduledAt.toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      });
      showToast({ style: Toast.Style.Success, title: "Scheduled!", message: `Will post on ${formatted}` });
    } catch (e) {
      showToast({ style: Toast.Style.Failure, title: "Failed to schedule", message: String(e) });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Schedule Post" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description text="Schedule a post for a future time" />
      <Form.DatePicker id="scheduledAt" title="Schedule for" type={Form.DatePicker.Type.DateTime} />
      <Form.Separator />
      <Form.Checkbox id="channel-x" title="Channels" label="X (Twitter)" defaultValue={true} />
      <Form.Checkbox id="channel-instagram" label="Instagram" defaultValue={true} />
      <Form.TextArea id="content" title="Content" placeholder="What's on your mind?" />
      <Form.TagPicker id="tags" title="Hashtags" info="Tags are added as hashtags to the post">
        <Form.TagPicker.Item value="leirsund" title="#leirsund" />
      </Form.TagPicker>
      <Form.Separator />
      <Form.FilePicker
        id="xImages"
        title="Images (X)"
        allowMultipleSelection={true}
        canChooseDirectories={false}
        info="Up to 4 images for X/Twitter (local files)"
      />
      <Form.TextArea
        id="instagramImageUrls"
        title="Image URLs (Instagram)"
        placeholder={"https://example.com/image1.jpg\nhttps://example.com/image2.jpg"}
        info="One public URL per line. Instagram requires publicly accessible image URLs."
      />
    </Form>
  );
}
