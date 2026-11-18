import { describe, expect, it } from "vitest";
import { SESSION_COOKIE, verifySessionToken, type AdminMode } from "./auth";
import { MAX_FAILURES, memoryFailureStore } from "./lockout";
import { handleLogin, handleLogout } from "./login";

const mode: AdminMode = { kind: "protected", passcode: "lotus", secret: "sec" };
const NOW = new Date("2026-11-18T12:00:00Z");

const login = (fields: Record<string, string>) =>
  new Request("https://mandala.example/api/admin/login", {
    method: "POST",
    body: new URLSearchParams(fields),
  });

function deps(store = memoryFailureStore()) {
  const delays: number[] = [];
  return {
    store,
    delays,
    d: {
      mode,
      store,
      now: () => NOW,
      delay: async (ms: number) => {
        delays.push(ms);
      },
      secureCookies: true,
    },
  };
}

describe("handleLogin", () => {
  it("signs in with the right passcode and returns to the requested page", async () => {
    const { d } = deps();
    const res = await handleLogin(login({ passcode: "lotus", next: "/admin?tab=activity" }), d);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://mandala.example/admin?tab=activity");
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=v1\\.`));
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Secure");
    const token = cookie.split(";")[0].split("=")[1];
    expect(await verifySessionToken(token, "sec", NOW.getTime())).toBe(true);
  });

  it("rejects a wrong passcode slowly and never redirects off-site", async () => {
    const { d, delays } = deps();
    const res = await handleLogin(login({ passcode: "nope", next: "https://evil.example" }), d);
    expect(res.headers.get("location")).toBe(
      "https://mandala.example/admin/login?error=wrong&next=%2Fadmin",
    );
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(delays).toEqual([600]);
  });

  it("locks after repeated failures, even for the right passcode", async () => {
    const { d } = deps();
    let last: Response | undefined;
    for (let i = 0; i < MAX_FAILURES; i++) last = await handleLogin(login({ passcode: "x" }), d);
    expect(last!.headers.get("location")).toContain("error=locked");
    const res = await handleLogin(login({ passcode: "lotus" }), d);
    expect(res.headers.get("location")).toContain("error=locked");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("clears the failure count after a successful sign-in", async () => {
    const { d, store } = deps();
    for (let i = 0; i < MAX_FAILURES - 1; i++) await handleLogin(login({ passcode: "x" }), d);
    await handleLogin(login({ passcode: "lotus" }), d);
    expect(await store.recentFailures(NOW)).toHaveLength(0);
  });

  it("treats an empty or malformed submission as wrong", async () => {
    const { d } = deps();
    expect((await handleLogin(login({}), d)).headers.get("location")).toContain("error=wrong");
    const bad = new Request("https://mandala.example/api/admin/login", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=x" },
      body: "garbage",
    });
    expect((await handleLogin(bad, d)).headers.get("location")).toContain("error=wrong");
  });

  it("is hidden when admin is disabled and skipped when it's open", async () => {
    expect((await handleLogin(login({}), { mode: { kind: "disabled" } })).status).toBe(404);
    const open = await handleLogin(login({}), { mode: { kind: "open" } });
    expect(open.headers.get("location")).toBe("https://mandala.example/admin");
  });
});

describe("handleLogout", () => {
  it("clears the cookie and returns to the passcode screen", () => {
    const res = handleLogout(new Request("https://mandala.example/api/admin/logout"), true);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://mandala.example/admin/login");
    expect(res.headers.get("set-cookie")).toMatch(new RegExp(`^${SESSION_COOKIE}=; .*Max-Age=0`));
  });
});
