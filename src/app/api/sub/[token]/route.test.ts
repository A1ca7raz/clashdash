import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import { createDb } from "@/db/client";
import { profiles } from "@/db/schema";

let db: Db;

vi.mock("@/db", async () => {
  const actual = await import("@/db");
  return { ...actual, getDb: async () => db };
});

vi.mock("@/server/profile-data", () => ({
  aggregateUserInfo: () => null,
  generateForProfile: async () => ({
    input: {},
    result: { errors: [], yaml: "mixed-port: 7890\n" },
  }),
}));

describe("profile subscription route", () => {
  beforeEach(async () => {
    db = await createDb("memory://");
  }, 60_000);

  it("records the latest pull time for a valid token", async () => {
    const [created] = await db.insert(profiles).values({ name: "Main", token: "main" }).returning({ id: profiles.id });
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/sub/main"), {
      params: Promise.resolve({ token: "main" }),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("mixed-port: 7890\n");
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, created.id));
    expect(profile.lastPulledAt).toBeInstanceOf(Date);
  });

  it("returns 404 without creating a pull record for an invalid token", async () => {
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/sub/missing"), {
      params: Promise.resolve({ token: "missing" }),
    });

    expect(response.status).toBe(404);
    expect(await db.$count(profiles)).toBe(0);
  });
});
