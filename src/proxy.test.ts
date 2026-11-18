import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createSessionToken, SESSION_COOKIE } from "@/lib/admin/auth";
import { proxy } from "./proxy";

const req = (path: string, cookie?: string) =>
  new NextRequest(`https://mandala.example${path}`, { headers: cookie ? { cookie } : {} });

afterEach(() => vi.unstubAllEnvs());

describe("proxy", () => {
  it("hides admin entirely in production without a passcode", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_PASSWORD", "");
    for (const p of ["/admin", "/admin/login", "/api/admin/activity", "/api/admin/login"]) {
      expect((await proxy(req(p))).status).toBe(404);
    }
  });

  it("is open in development without a passcode", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ADMIN_PASSWORD", "");
    expect((await proxy(req("/admin"))).headers.get("x-middleware-next")).toBe("1");
  });

  describe("with a passcode", () => {
    const setup = () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("ADMIN_PASSWORD", "lotus");
    };
    const cookie = async () => `${SESSION_COOKIE}=${await createSessionToken("passcode:lotus")}`;

    it("sends visitors to the passcode screen, remembering where they were going", async () => {
      setup();
      const res = await proxy(req("/admin?tab=activity"));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe(
        "https://mandala.example/admin/login?next=%2Fadmin%3Ftab%3Dactivity",
      );
    });

    it("answers API calls with 401 instead of a redirect", async () => {
      setup();
      expect((await proxy(req("/api/admin/activity"))).status).toBe(401);
    });

    it("lets the passcode screen and sign-in through", async () => {
      setup();
      expect((await proxy(req("/admin/login"))).headers.get("x-middleware-next")).toBe("1");
      expect((await proxy(req("/api/admin/login"))).headers.get("x-middleware-next")).toBe("1");
    });

    it("lets signed-in requests through and skips the passcode screen", async () => {
      setup();
      const c = await cookie();
      expect((await proxy(req("/admin", c))).headers.get("x-middleware-next")).toBe("1");
      expect((await proxy(req("/api/admin/activity", c))).headers.get("x-middleware-next")).toBe(
        "1",
      );
      const login = await proxy(req("/admin/login", c));
      expect(login.headers.get("location")).toBe("https://mandala.example/admin");
    });

    it("rejects forged or stale cookies", async () => {
      setup();
      const forged = `${SESSION_COOKIE}=${await createSessionToken("guess")}`;
      expect((await proxy(req("/admin", forged))).status).toBe(307);
    });
  });
});
