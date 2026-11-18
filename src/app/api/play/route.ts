import { handlePlay } from "@/lib/activity/handler";
import { getDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handlePlay(request, getDb());
}
