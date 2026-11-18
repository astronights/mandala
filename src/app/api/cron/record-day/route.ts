import { handleRecordDay } from "@/lib/activity/cron";
import { getDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleRecordDay(request, getDb());
}
