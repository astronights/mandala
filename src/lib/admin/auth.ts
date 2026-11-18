/**
 * Admin access: a single passcode (ADMIN_PASSWORD) exchanged for a signed,
 * HTTP-only session cookie. Uses Web Crypto, so it runs in the proxy too.
 */

export const SESSION_COOKIE = "mandala_admin";
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const TOKEN_VERSION = "v1";

export type AdminMode =
  /** Passcode set: sign-in required. */
  | { kind: "protected"; passcode: string; secret: string }
  /** Development without a passcode: open, for convenience. */
  | { kind: "open" }
  /** Production without a passcode: admin doesn't exist. */
  | { kind: "disabled" };

export function adminMode(env: Record<string, string | undefined> = process.env): AdminMode {
  const passcode = env.ADMIN_PASSWORD;
  if (passcode) {
    // A separate secret lets you rotate sessions without changing the passcode.
    // Otherwise derive one from the passcode: changing it signs everyone out.
    return {
      kind: "protected",
      passcode,
      secret: env.ADMIN_SESSION_SECRET || `passcode:${passcode}`,
    };
  }
  return env.NODE_ENV === "production" ? { kind: "disabled" } : { kind: "open" };
}

/** Compares every character, so timing doesn't reveal how much matched. */
export function passcodeMatches(input: string, passcode: string): boolean {
  let diff = input.length ^ passcode.length;
  for (let i = 0; i < Math.max(input.length, passcode.length); i++) {
    diff |= (input.charCodeAt(i) || 0) ^ (passcode.charCodeAt(i) || 0);
  }
  return diff === 0;
}

const encoder = new TextEncoder();

function base64url(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function hmacKey(secret: string, usage: "sign" | "verify") {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

/** Token: `v1.<expiry seconds>.<signature>`. */
export async function createSessionToken(secret: string, nowMs = Date.now()): Promise<string> {
  const expires = Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS;
  const payload = `${TOKEN_VERSION}.${expires}`;
  const sig = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret, "sign"),
    encoder.encode(payload),
  );
  return `${payload}.${base64url(sig)}`;
}

export async function verifySessionToken(
  token: string | undefined | null,
  secret: string,
  nowMs = Date.now(),
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION || !/^\d+$/.test(parts[1])) return false;
  if (Number(parts[1]) * 1000 <= nowMs) return false;
  const sig = fromBase64url(parts[2]);
  if (!sig) return false;
  return crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret, "verify"),
    sig,
    encoder.encode(`${parts[0]}.${parts[1]}`),
  );
}

/** Only redirect back into the admin area, never to another site. */
export function safeNext(next: unknown): string {
  if (typeof next !== "string") return "/admin";
  if (!next.startsWith("/admin") || next.startsWith("//") || next.includes("\\")) return "/admin";
  if (next.startsWith("/admin/login")) return "/admin";
  return next;
}

/** Reads the session cookie from a Cookie header. */
export function readSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=") || null;
  }
  return null;
}

/** Whether a request may see admin data. */
export async function isAdmin(
  request: Request,
  mode: AdminMode = adminMode(),
  nowMs = Date.now(),
): Promise<boolean> {
  if (mode.kind === "open") return true;
  if (mode.kind === "disabled") return false;
  return verifySessionToken(readSessionCookie(request.headers.get("cookie")), mode.secret, nowMs);
}
