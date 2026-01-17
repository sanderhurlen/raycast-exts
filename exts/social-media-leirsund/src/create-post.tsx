import { Action, ActionPanel, Form, showToast, Toast } from "@raycast/api";
import z from "zod";
import { authorize, client, fetchTokens } from "./x";

const formSchema = z.object({
  "channel-instagram": z.boolean(),
  "channel-x": z.boolean(),
  content: z.string().min(0),
  tags: z.array(z.string()),
});

export default function Command() {
  async function handleSubmit(values: unknown) {
    const parsed = formSchema.safeParse(values);
    if (!parsed.success) {
      showToast({ title: "Valideringsfeil", message: JSON.stringify(parsed.error.issues) });
      return;
    }

    await publishPost(parsed.data);
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description text="Create a post" />
      <Form.Checkbox id="channel-instagram" title="Channels" label="Instagram" defaultValue={true} />
      <Form.Checkbox id="channel-x" label="X" defaultValue={true} />
      <Form.TextArea id="content" title="Content" placeholder="Enter multi-line text" />
      <Form.TagPicker id="tags" title="Tags" info="Select tags for the post">
        <Form.TagPicker.Item value="leileilei" title="Lei Lei Lei" />
      </Form.TagPicker>
    </Form>
  );
}

async function publishPost(data: z.infer<typeof formSchema>) {
  const posts: string[] = [];
  if (data["channel-instagram"]) {
    showToast({ style: Toast.Style.Animated, title: "Publiserer", message: "Publiserer til Instagram..." });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    console.log("Publishing to Instagram");
    posts.push("https://instagram.com/p/xyz");
  }

  if (data["channel-x"]) {
    showToast({ style: Toast.Style.Animated, title: "Publiserer", message: "Publiserer til X..." });
    await new Promise((resolve) => setTimeout(resolve, 2000));

    await authorize();
    const tokens = await client.getTokens();
    console.log("Fetched tokens:", tokens);
    // const response = await fetch(new URL("https://api.example.com/publish"), {
    //     method: "POST",
    //     headers: {
    //         "Content-Type": "application/json",
    //         "Authorization": `Bearer ${process.env.X_API_TOKEN}`,
    //     },
    //     body: JSON.stringify({
    //         content: data.content,
    //         tags: data.tags,
    //     }),
    // });

    posts.push("https://x.com/p/xyz");
  }
  showToast({
    style: Toast.Style.Success,
    title: "Publisert",
    primaryAction: { title: "Se innlegg på Instagram", onAction: () => console.log("Åpner innlegg") },
    secondaryAction: { title: "Se innlegg på X", onAction: () => console.log("Åpner innlegg") },
  });
}
