import { Action, ActionPanel, environment, Icon, List, open, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";
import { deleteScheduledPost, listScheduledPosts } from "./scheduler";
import { publishPost } from "./publish";
import type { ScheduledPost } from "./types";

export default function Command() {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  function refresh() {
    setPosts(listScheduledPosts());
  }

  useEffect(() => {
    refresh();
    setIsLoading(false);
  }, []);

  async function handlePublishNow(post: ScheduledPost) {
    showToast({ style: Toast.Style.Animated, title: "Publishing…" });
    try {
      const results = await publishPost(post.payload);
      deleteScheduledPost(post.id);
      refresh();

      const succeeded = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);
      const urls = succeeded.map((r) => r.url).filter(Boolean) as string[];

      showToast({
        style: failed.length > 0 && succeeded.length === 0 ? Toast.Style.Failure : Toast.Style.Success,
        title: failed.length > 0 && succeeded.length === 0 ? "Failed to publish" : "Published!",
        message: failed.length > 0 ? `Failed: ${failed.map((r) => r.platform).join(", ")}` : undefined,
        primaryAction: urls[0] != null ? { title: "Open post", onAction: () => open(urls[0]) } : undefined,
      });
    } catch (e) {
      showToast({ style: Toast.Style.Failure, title: "Error", message: String(e) });
    }
  }

  function handleDelete(post: ScheduledPost) {
    deleteScheduledPost(post.id);
    refresh();
    showToast({ style: Toast.Style.Success, title: "Deleted" });
  }

  // Suppress unused warning — environment.assetsPath is available for future use
  void environment.assetsPath;

  return (
    <List isLoading={isLoading} navigationTitle="Scheduled Posts">
      {posts.length === 0 && !isLoading ? (
        <List.EmptyView title="No scheduled posts" description="Use 'Schedule Post' to schedule a future post" />
      ) : (
        posts.map((post) => {
          const platformLabel = post.payload.platforms.join(" + ").toUpperCase();
          const preview = post.payload.text.length > 60 ? `${post.payload.text.slice(0, 60)}…` : post.payload.text;
          const scheduledDate = new Date(post.scheduledAt);
          const isPast = scheduledDate < new Date();

          return (
            <List.Item
              key={post.id}
              icon={isPast ? Icon.Clock : Icon.Calendar}
              title={preview}
              subtitle={platformLabel}
              accessories={[{ date: scheduledDate, tooltip: scheduledDate.toLocaleString() }]}
              actions={
                <ActionPanel>
                  <Action
                    title="Publish Now"
                    icon={Icon.Upload}
                    onAction={() => handlePublishNow(post)}
                  />
                  <Action
                    title="Delete"
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    onAction={() => handleDelete(post)}
                  />
                </ActionPanel>
              }
            />
          );
        })
      )}
    </List>
  );
}
