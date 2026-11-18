import { handleLogout } from "@/lib/admin/login";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleLogout(request);
}
