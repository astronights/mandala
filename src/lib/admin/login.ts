import { getDb } from "@/lib/db/client";
import {
  adminMode,
  createSessionToken,
  passcodeMatches,
  safeNext,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  type AdminMode,
} from "./auth";
import { dbFailureStore, lockedUntil, memoryFailureStore, type FailureStore } from "./lockout";

const memoryStore = memoryFailureStore();

export function defaultFailureStore(): FailureStore {
  const db = getDb();
  return db ? dbFailureStore(db) : memoryStore;
}

export interface LoginDeps {
  mode?: AdminMode;
  store?: FailureStore;
  now?: () => Date;
  /** Slows down guessing; injectable so tests don't wait. */
  delay?: (ms: number) => Promise<void>;
  secureCookies?: boolean;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function redirect(request: Request, path: string, cookie?: string): Response {
  const headers = new Headers({ location: new URL(path, request.url).toString() });
  if (cookie) headers.append("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}

export function sessionCookie(value: string, maxAge: number, secure: boolean): string {
  return [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Strict",
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

/** POST /api/admin/login, from the passcode form. */
export async function handleLogin(request: Request, deps: LoginDeps = {}): Promise<Response> {
  const mode = deps.mode ?? adminMode();
  if (mode.kind === "disabled") return new Response("Not found", { status: 404 });
  if (mode.kind === "open") return redirect(request, "/admin");

  const now = deps.now ?? (() => new Date());
  const store = deps.store ?? defaultFailureStore();
  const delay = deps.delay ?? sleep;
  const secure = deps.secureCookies ?? process.env.NODE_ENV === "production";

  let passcode = "";
  let next = "/admin";
  try {
    const form = await request.formData();
    passcode = String(form.get("passcode") ?? "");
    next = safeNext(form.get("next"));
  } catch {
    return redirect(request, "/admin/login?error=wrong");
  }
  const back = (error: string) =>
    redirect(request, `/admin/login?error=${error}&next=${encodeURIComponent(next)}`);

  if (await lockedUntil(store, now())) return back("locked");

  if (!passcode || !passcodeMatches(passcode, mode.passcode)) {
    await store.recordFailure(now());
    await delay(600);
    return back((await lockedUntil(store, now())) ? "locked" : "wrong");
  }

  await store.clear();
  const token = await createSessionToken(mode.secret, now().getTime());
  return redirect(request, next, sessionCookie(token, SESSION_TTL_SECONDS, secure));
}
