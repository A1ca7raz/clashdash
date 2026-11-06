import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";

/** Edge-safe session helpers, shared by middleware and server code. */
export const SESSION_COOKIE = "clashdash_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function secret(): Uint8Array {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 16) throw new Error("JWT_SECRET 未设置或过短（至少 16 个字符）");
  return new TextEncoder().encode(value);
}

export function createSessionToken(): Promise<string> {
  return new SignJWT({ sub: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret());
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}
