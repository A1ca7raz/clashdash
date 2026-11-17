import { eq, sql } from "drizzle-orm";
import { generate } from "otplib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import { createDb } from "@/db/client";
import { adminAuth } from "@/db/schema";
import { SESSION_COOKIE, TOTP_CHALLENGE_COOKIE, verifySessionToken, verifyTotpChallenge } from "@/lib/session";
import { changeAdminPassword, confirmTotpEnrollment, ensureAdminAuth, startTotpEnrollment } from "@/server/admin-auth";
import { requireAuth } from "@/server/auth";
import { login } from "./auth";

const mocks = vi.hoisted(() => ({ cookies: new Map<string, string>(), redirect: vi.fn(), initialize: vi.fn() }));
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
vi.mock("@/server/database-init", () => ({ initializeEmptyDatabase: mocks.initialize }));

let db: Db;

beforeEach(async () => {
  process.env.ADMIN_INITIAL_PASSWORD = "initial-password";
  process.env.JWT_SECRET = "0123456789abcdef0123456789abcdef";
  mocks.cookies.clear();
  mocks.redirect.mockReset().mockImplementation((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  });
  mocks.initialize.mockReset().mockResolvedValue(undefined);
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
    await ensureAdminAuth(db);
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

  it("does not migrate when the initial password is missing or wrong", async () => {
    await db.execute(sql`DROP TABLE admin_auth`);
    delete process.env.ADMIN_INITIAL_PASSWORD;
    expect(await login(undefined, passwordForm())).toEqual({ error: "数据库尚未初始化，请先设置 ADMIN_INITIAL_PASSWORD" });
    expect(mocks.initialize).not.toHaveBeenCalled();

    process.env.ADMIN_INITIAL_PASSWORD = "initial-password";
    const wrong = new FormData();
    wrong.set("password", "wrong");
    expect(await login(undefined, wrong)).toEqual({ error: "初始密码错误" });
    expect(mocks.initialize).not.toHaveBeenCalled();
  });

  it("migrates a missing schema and signs in after initial password verification", async () => {
    await db.execute(sql`DROP TABLE admin_auth`);
    mocks.initialize.mockImplementation(async () => {
      await db.execute(sql`
        CREATE TABLE "admin_auth" (
          "id" integer PRIMARY KEY NOT NULL,
          "password_hash" text NOT NULL,
          "auth_version" integer DEFAULT 1 NOT NULL,
          "totp_secret" text,
          "totp_pending_secret" text,
          "totp_last_counter" integer,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `);
    });

    await expect(login(undefined, passwordForm())).rejects.toThrow("REDIRECT:/");
    expect(mocks.initialize).toHaveBeenCalledTimes(1);
    expect(await db.$count(adminAuth)).toBe(1);
    expect(await verifySessionToken(mocks.cookies.get(SESSION_COOKIE))).toEqual({ authVersion: 1 });
  });

  it("rejects a previous JWT after the administrator is deleted without recreating it", async () => {
    await expect(login(undefined, passwordForm())).rejects.toThrow("REDIRECT:/");
    await db.delete(adminAuth);

    await expect(requireAuth()).rejects.toMatchObject({ reason: "admin" });
    expect(await db.$count(adminAuth)).toBe(0);
  });
});
