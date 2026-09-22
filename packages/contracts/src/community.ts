import { z } from "zod";

export const PostKind = z.enum(["idea", "agents-md", "showcase", "question"]);
export const CreatePostRequest = z.object({
  kind: PostKind,
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(1).max(30000),
});
export type CreatePostRequest = z.infer<typeof CreatePostRequest>;
export const CreateReplyRequest = z.object({ body: z.string().trim().min(1).max(10000) });
export const CommunityPost = CreatePostRequest.extend({
  id: z.string(),
  handle: z.string(),
  createdAt: z.number(),
  replies: z.number(),
});
export type CommunityPost = z.infer<typeof CommunityPost>;
export const CommunityReply = z.object({
  id: z.string(),
  body: z.string(),
  handle: z.string(),
  createdAt: z.number(),
});
export type CommunityReply = z.infer<typeof CommunityReply>;
export interface CommunityList {
  posts: CommunityPost[];
  nextOffset: number | null;
}
export interface CommunityThread {
  post: CommunityPost;
  replies: CommunityReply[];
  nextOffset: number | null;
}
