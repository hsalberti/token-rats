import { redirect } from "next/navigation";

export const runtime = "edge";

export default function CommunityPage() {
  redirect("https://www.reddit.com/r/TokenRats/");
}
