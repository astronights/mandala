import { NextResponse, type NextRequest } from "next/server";
import { adminMode, isAdmin } from "@/lib/admin/auth";

const PUBLIC_ADMIN_PATHS = new Set(["/admin/login", "/api/admin/login"]);

/** Gate for everything under /admin and /api/admin. */
export async function proxy(request: NextRequest) {
  const mode = adminMode();
  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (mode.kind === "disabled") return new NextResponse("Not found", { status: 404 });
  if (mode.kind === "open") return NextResponse.next();

  const signedIn = await isAdmin(request, mode);

  if (PUBLIC_ADMIN_PATHS.has(pathname)) {
    // Already signed in? Skip the passcode screen.
    if (signedIn && pathname === "/admin/login") {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return NextResponse.next();
  }
  if (signedIn) return NextResponse.next();

  if (isApi) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const login = new URL("/admin/login", request.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin/:path*"],
};
