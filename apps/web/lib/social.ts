import { API_URL, ApiError } from "./api";
export async function socialRequest<T>(
  path: string,
  options: RequestInit & { cookieHeader?: string } = {},
): Promise<T> {
  const { cookieHeader, ...rest } = options;
  const headers = new Headers(rest.headers);
  if (cookieHeader) headers.set("Cookie", cookieHeader);
  if (rest.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_URL}/v1/${path}`, {
    ...rest,
    headers,
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({ error: "Please try again" }))) as {
      error?: string;
    };
    throw new ApiError(response.status, data.error ?? "Please try again");
  }
  return response.json() as Promise<T>;
}
