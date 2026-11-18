import { NextResponse, type NextRequest } from "next/server";
import { checkAdminAuth } from "@/lib/adminAuth";

export function proxy(request: NextRequest) {
  const decision = checkAdminAuth(
    request.headers.get("authorization"),
    process.env.ADMIN_PASSWORD,
    process.env.NODE_ENV === "production",
  );
  if (decision.ok) return NextResponse.next();
  if (decision.status === 404) return new NextResponse("Not found", { status: 404 });
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Mandala admin", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
