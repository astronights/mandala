/**
 * Basic-auth gate for /admin, set by the ADMIN_PASSWORD environment variable
 * (add it in Vercel → Project → Settings → Environment Variables).
 *
 *  - password set   → require it (any username)
 *  - password unset → open in development, hidden (404) in production
 */

export type AdminDecision = { ok: true } | { ok: false; status: 401 | 404 };

function safeEqual(a: string, b: string): boolean {
  // Compare every character, so the time taken doesn't reveal the password.
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export function decodeBasicAuth(header: string | null): { user: string; pass: string } | null {
  if (!header) return null;
  const match = /^Basic\s+([A-Za-z0-9+/=]+)$/i.exec(header.trim());
  if (!match) return null;
  try {
    const decoded = atob(match[1]);
    const sep = decoded.indexOf(":");
    if (sep < 0) return null;
    return { user: decoded.slice(0, sep), pass: decoded.slice(sep + 1) };
  } catch {
    return null;
  }
}

export function checkAdminAuth(
  authHeader: string | null,
  password: string | undefined,
  isProduction: boolean,
): AdminDecision {
  if (!password) return isProduction ? { ok: false, status: 404 } : { ok: true };
  const creds = decodeBasicAuth(authHeader);
  if (creds && safeEqual(creds.pass, password)) return { ok: true };
  return { ok: false, status: 401 };
}
