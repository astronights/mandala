import type { Db } from "@/lib/db/client";
import { recordPlay } from "./record";
import { parsePlayReport } from "./report";

export const MAX_BODY_BYTES = 2048;

const empty = (status: number) => new Response(null, { status });
const error = (status: number, message: string) => Response.json({ error: message }, { status });

/** Only accept reports from this site's own pages. */
function isSameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

/**
 * POST /api/play. Tracking must never get in the way of playing, so the app
 * ignores the response. Without a database this quietly accepts and drops.
 */
export async function handlePlay(
  request: Request,
  db: Db | null,
  now: Date = new Date(),
): Promise<Response> {
  if (!isSameOrigin(request)) return error(403, "Cross-site reports are not accepted");
  if (!db) return empty(204);

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return error(413, "Report too large");

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return error(413, "Report too large");
    body = JSON.parse(text);
  } catch {
    return error(400, "Body must be JSON");
  }

  const parsed = parsePlayReport(body, now);
  if (!parsed.ok) return error(400, parsed.error);

  try {
    await recordPlay(db, parsed.value);
    return empty(204);
  } catch (e) {
    console.error("Failed to record play", e);
    return error(503, "Could not record right now");
  }
}
