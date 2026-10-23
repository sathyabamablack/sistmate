import { z } from "zod";
import { normalizeSiteUrl, parseWith, stripHtml } from "../shared";
import { parseWsError } from "./wsError";

/** Raw `core_webservice_get_site_info` response (only the fields we rely on are required). */
export const RawSiteInfoSchema = z
  .object({
    sitename: z.string().optional(),
    username: z.string(),
    firstname: z.string().optional(),
    lastname: z.string().optional(),
    fullname: z.string(),
    lang: z.string().optional(),
    userid: z.coerce.number().int(),
    siteurl: z.string(),
    userpictureurl: z.string().optional(),
    release: z.string().optional(),
    version: z.string().optional(),
    functions: z
      .array(z.object({ name: z.string(), version: z.string().optional() }).passthrough())
      .optional(),
  })
  .passthrough();
export type RawSiteInfo = z.infer<typeof RawSiteInfoSchema>;

export interface SiteInfo {
  userid: number;
  fullname: string;
  username: string;
  /** Without trailing slash — used to build course/activity URLs. */
  siteurl: string;
  sitename?: string;
  release?: string;
  /** WS functions this token may call (empty if Moodle omitted the list). */
  functions: string[];
}

export function mapSiteInfo(json: unknown): SiteInfo {
  parseWsError(json);
  const raw = parseWith(RawSiteInfoSchema, json, "ws.mapSiteInfo");
  return {
    userid: raw.userid,
    fullname: stripHtml(raw.fullname),
    username: raw.username,
    siteurl: normalizeSiteUrl(raw.siteurl),
    sitename: raw.sitename !== undefined ? stripHtml(raw.sitename) : undefined,
    release: raw.release,
    functions: (raw.functions ?? []).map((f) => f.name),
  };
}
