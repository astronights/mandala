import { handleActivity } from "@/lib/admin/activity";
import { getDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleActivity(request, getDb());
}
