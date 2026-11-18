import { describe, expect, it } from "vitest";
import { checkAdminAuth, decodeBasicAuth } from "./adminAuth";

const basic = (user: string, pass: string) => `Basic ${btoa(`${user}:${pass}`)}`;

describe("decodeBasicAuth", () => {
  it("decodes user and password, allowing colons in the password", () => {
    expect(decodeBasicAuth(basic("admin", "a:b:c"))).toEqual({ user: "admin", pass: "a:b:c" });
  });

  it.each([null, "", "Bearer abc", "Basic", "Basic !!!", `Basic ${btoa("nocolon")}`])(
    "rejects %s",
    (header) => {
      expect(decodeBasicAuth(header as string | null)).toBeNull();
    },
  );
});

describe("checkAdminAuth", () => {
  it("is open in development when no password is configured", () => {
    expect(checkAdminAuth(null, undefined, false)).toEqual({ ok: true });
  });

  it("is hidden in production when no password is configured", () => {
    expect(checkAdminAuth(basic("a", "anything"), undefined, true)).toEqual({
      ok: false,
      status: 404,
    });
    expect(checkAdminAuth(null, "", true)).toEqual({ ok: false, status: 404 });
  });

  it("requires the configured password", () => {
    expect(checkAdminAuth(null, "secret", true)).toEqual({ ok: false, status: 401 });
    expect(checkAdminAuth(basic("x", "wrong"), "secret", true)).toEqual({ ok: false, status: 401 });
    expect(checkAdminAuth(basic("x", "secre"), "secret", true)).toEqual({ ok: false, status: 401 });
    expect(checkAdminAuth(basic("x", "secret!"), "secret", true)).toEqual({
      ok: false,
      status: 401,
    });
    expect(checkAdminAuth(basic("x", "secret"), "secret", true)).toEqual({ ok: true });
    expect(checkAdminAuth(basic("x", "secret"), "secret", false)).toEqual({ ok: true });
  });
});
