import { describe, expect, it } from "vitest";
import {
  adminMode,
  createSessionToken,
  isAdmin,
  passcodeMatches,
  readSessionCookie,
  safeNext,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  verifySessionToken,
} from "./auth";

const SECRET = "s3cret";
const NOW = Date.UTC(2026, 10, 18, 12);

describe("adminMode", () => {
  it("is protected when a passcode is set, deriving a secret if none is given", () => {
    expect(adminMode({ ADMIN_PASSWORD: "pw" })).toEqual({
      kind: "protected",
      passcode: "pw",
      secret: "passcode:pw",
    });
    expect(adminMode({ ADMIN_PASSWORD: "pw", ADMIN_SESSION_SECRET: "x" })).toMatchObject({
      secret: "x",
    });
  });

  it("is open in development and disabled in production without a passcode", () => {
    expect(adminMode({ NODE_ENV: "development" })).toEqual({ kind: "open" });
    expect(adminMode({ NODE_ENV: "production" })).toEqual({ kind: "disabled" });
    expect(adminMode({ NODE_ENV: "production", ADMIN_PASSWORD: "" })).toEqual({ kind: "disabled" });
  });
});

describe("passcodeMatches", () => {
  it("matches only the exact passcode", () => {
    expect(passcodeMatches("lotus", "lotus")).toBe(true);
    for (const wrong of ["", "lotu", "lotus!", "Lotus", "sutol"]) {
      expect(passcodeMatches(wrong, "lotus")).toBe(false);
    }
  });
});

describe("session tokens", () => {
  it("verify until they expire", async () => {
    const token = await createSessionToken(SECRET, NOW);
    expect(token).toMatch(/^v1\.\d+\.[A-Za-z0-9_-]+$/);
    expect(await verifySessionToken(token, SECRET, NOW)).toBe(true);
    expect(await verifySessionToken(token, SECRET, NOW + (SESSION_TTL_SECONDS - 60) * 1000)).toBe(
      true,
    );
    expect(await verifySessionToken(token, SECRET, NOW + SESSION_TTL_SECONDS * 1000)).toBe(false);
  });

  it("reject other secrets, tampering and junk", async () => {
    const token = await createSessionToken(SECRET, NOW);
    const [v, exp, sig] = token.split(".");
    expect(await verifySessionToken(token, "other", NOW)).toBe(false);
    expect(await verifySessionToken(`${v}.${Number(exp) + 999999}.${sig}`, SECRET, NOW)).toBe(
      false,
    );
    expect(await verifySessionToken(`${v}.${exp}.${sig.slice(0, -2)}AA`, SECRET, NOW)).toBe(false);
    for (const junk of [null, undefined, "", "v1", "v2.1.abc", "v1.abc.def", `v1.${exp}.***`]) {
      expect(await verifySessionToken(junk, SECRET, NOW)).toBe(false);
    }
  });
});

describe("safeNext", () => {
  it.each([
    ["/admin", "/admin"],
    ["/admin?tab=activity", "/admin?tab=activity"],
    ["/admin/login", "/admin"],
    ["/", "/admin"],
    ["//evil.example/admin", "/admin"],
    ["https://evil.example/admin", "/admin"],
    ["/admin\\..\\", "/admin"],
    [undefined, "/admin"],
  ])("%s → %s", (input, out) => {
    expect(safeNext(input)).toBe(out);
  });
});

describe("isAdmin", () => {
  const mode = { kind: "protected" as const, passcode: "pw", secret: SECRET };
  const req = (cookie?: string) =>
    new Request("https://x.example/api/admin/activity", { headers: cookie ? { cookie } : {} });

  it("reads the session cookie among others", async () => {
    const token = await createSessionToken(SECRET, NOW);
    expect(readSessionCookie(`a=1; ${SESSION_COOKIE}=${token}; b=2`)).toBe(token);
    expect(readSessionCookie("a=1")).toBeNull();
    expect(readSessionCookie(null)).toBeNull();
    expect(await isAdmin(req(`${SESSION_COOKIE}=${token}`), mode, NOW)).toBe(true);
    expect(await isAdmin(req(), mode, NOW)).toBe(false);
  });

  it("follows the mode when there is no passcode", async () => {
    expect(await isAdmin(req(), { kind: "open" })).toBe(true);
    expect(await isAdmin(req(), { kind: "disabled" })).toBe(false);
  });
});
