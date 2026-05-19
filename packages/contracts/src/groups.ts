import { z } from "zod";
import { CountryCode, RoomCode } from "./room.js";

/** v1.2 Track AE — public room listing entry. */
export const PublicGroup = z.object({
  code: RoomCode,
  name: z.string(),
  country: CountryCode,
  memberCount: z.number().int().nonnegative(),
  createdAt: z.number().int().positive(),
});
export type PublicGroup = z.infer<typeof PublicGroup>;

export const ListPublicGroupsResponse = z.object({
  /** ISO 3166-1 alpha-2 the request was geolocated to. Read from `cf-ipcountry`. */
  viewerCountry: CountryCode.nullable(),
  groups: z.array(PublicGroup),
});
export type ListPublicGroupsResponse = z.infer<typeof ListPublicGroupsResponse>;

export const CreatePublicGroupRequest = z.object({
  name: z.string().min(1).max(64),
  /** Must equal the creator's resolved `cf-ipcountry`. Server enforces. */
  country: CountryCode,
});
export type CreatePublicGroupRequest = z.infer<typeof CreatePublicGroupRequest>;
