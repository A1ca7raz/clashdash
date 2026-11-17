import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";

/** Edge-safe session helpers, shared by middleware and server code. */
export const SESSION_COOKIE = "clashdash_session";
export const TOTP_CHALLENGE_COOKIE = "clashdash_totp_challenge";
export const TOTP_CHALLENGE_MAX_AGE = 60 * 5;
export const TOTP_CHALLENGE_MAX_ATTEMPTS = 5;

const DEFAULT_SESSION_MAX_AGE = 60 * 60 * 24;

export function sessionMaxAge(): number {
  const raw = process.env.JWT_SESSION_TTL;
  if (!raw) return DEFAULT_SESSION_MAX_AGE;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("JWT_SESSION_TTL 必须是正整数（秒）");
  return value;
}

export interface SessionPayload {
  authVersion: number;
}

export interface TotpChallengePayload extends SessionPayload {
  attempts: number;
}

function secret(): Uint8Array {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 16) throw new Error("JWT_SECRET 未设置或过短（至少 16 个字符）");
  return new TextEncoder().encode(value);
}

export function createSessionToken(authVersion = 1): Promise<string> {
  return new SignJWT({ sub: "admin", typ: "session", ver: authVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${sessionMaxAge()}s`)
    .sign(secret());
}

export async function verifySessionToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (payload.sub !== "admin" || payload.typ !== "session" || typeof payload.ver !== "number") return null;
    return { authVersion: payload.ver };
  } catch {
    return null;
  }
}

export function createTotpChallenge(authVersion: number, attempts = 0): Promise<string> {
  return new SignJWT({ sub: "admin", typ: "totp-challenge", ver: authVersion, att: attempts })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${TOTP_CHALLENGE_MAX_AGE}s`)
    .sign(secret());
}

export async function verifyTotpChallenge(token: string | undefined): Promise<TotpChallengePayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (payload.sub !== "admin" || payload.typ !== "totp-challenge" || typeof payload.ver !== "number") return null;
    return { authVersion: payload.ver, attempts: typeof payload.att === "number" ? payload.att : 0 };
  } catch {
    return null;
  }
}
