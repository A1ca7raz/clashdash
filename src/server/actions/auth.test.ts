import { eq } from "drizzle-orm";
import { generate } from "otplib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import { createDb } from "@/db/client";
import { adminAuth } from "@/db/schema";
import { SESSION_COOKIE, TOTP_CHALLENGE_COOKIE, verifySessionToken, verifyTotpChallenge } from "@/lib/session";
import { changeAdminPassword, confirmTotpEnrollment, startTotpEnrollment } from "@/server/admin-auth";
import { requireAuth } from "@/server/auth";
import { login } from "./auth";

const mocks = vi.hoisted(() => ({ cookies: new Map<string, string>(), redirect: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => ({ value: mocks.cookies.get(name) }),
    set: (name: string, value: string) => mocks.cookies.set(name, value),
    delete: (name: string) => mocks.cookies.delete(name),
  }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/db", async () => {
  const actual = await import("@/db");
  return { ...actual, getDb: async () => db };
});

let db: Db;

beforeEach(async () => {
  process.env.ADMIN_INITIAL_PASSWORD = "initial-password";
  process.env.JWT_SECRET = "0123456789abcdef0123456789abcdef";
  mocks.cookies.clear();
  mocks.redirect.mockReset().mockImplementation((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  });
  db = await createDb("memory://");
}, 60_000);

const passwordForm = () => {
  const form = new FormData();
  form.set("password", "initial-password");
  return form;
};

describe("login action", () => {
  it("issues a full session when TOTP is disabled", async () => {
    await expect(login(undefined, passwordForm())).rejects.toThrow("REDIRECT:/");
    const session = mocks.cookies.get(SESSION_COOKIE);
    expect(await verifySessionToken(session)).toEqual({ authVersion: 1 });
    expect(mocks.cookies.has(TOTP_CHALLENGE_COOKIE)).toBe(false);
  });

  it("requires a separate TOTP challenge before issuing a session", async () => {
    const enrollment = await startTotpEnrollment(db, "initial-password");
    const token = await generate({ secret: enrollment.secret });
    await confirmTotpEnrollment(db, token);
    mocks.cookies.clear();

    expect(await login(undefined, passwordForm())).toEqual({ requiresTotp: true });
    expect(mocks.cookies.has(SESSION_COOKIE)).toBe(false);
    expect(await verifyTotpChallenge(mocks.cookies.get(TOTP_CHALLENGE_COOKIE))).toEqual({ authVersion: 2 });

    await db.update(adminAuth).set({ totpLastCounter: null }).where(eq(adminAuth.id, 1));
    const form = new FormData();
    form.set("token", token);
    await expect(login({ requiresTotp: true }, form)).rejects.toThrow("REDIRECT:/");
    expect(await verifySessionToken(mocks.cookies.get(SESSION_COOKIE))).toEqual({ authVersion: 2 });
    expect(mocks.cookies.has(TOTP_CHALLENGE_COOKIE)).toBe(false);
  });

  it("rejects an old session after the password changes", async () => {
    await expect(login(undefined, passwordForm())).rejects.toThrow("REDIRECT:/");
    await changeAdminPassword(db, "initial-password", "new-password", "");
    await expect(requireAuth()).rejects.toThrow("登录状态已失效");
  });
});
