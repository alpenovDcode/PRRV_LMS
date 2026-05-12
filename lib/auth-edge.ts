import { jwtVerify, SignJWT } from "jose";
import { UserRole } from "@prisma/client";

export interface JWTPayloadEdge {
  userId: string;
  email: string;
  role: UserRole;
  sessionId: string;
  iat?: number;
  exp?: number;
}

const ACCESS_TTL_EDGE = process.env.JWT_EXPIRES_IN || "1d";
const REFRESH_TTL_EDGE = process.env.JWT_REFRESH_EXPIRES_IN || "30d";

async function verifyWithSecret(token: string, rawSecret: string): Promise<JWTPayloadEdge | null> {
  try {
    const secret = new TextEncoder().encode(rawSecret);
    const { payload } = await jwtVerify(token, secret);
    if (
      payload &&
      typeof payload === "object" &&
      "userId" in payload &&
      "email" in payload &&
      "role" in payload &&
      "sessionId" in payload
    ) {
      return payload as unknown as JWTPayloadEdge;
    }
    return null;
  } catch {
    return null;
  }
}

export async function verifyAccessTokenEdge(token: string): Promise<JWTPayloadEdge | null> {
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) throw new Error("JWT_SECRET must be set");
  return verifyWithSecret(token, JWT_SECRET);
}

export async function verifyRefreshTokenEdge(token: string): Promise<JWTPayloadEdge | null> {
  const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
  if (!JWT_REFRESH_SECRET) throw new Error("JWT_REFRESH_SECRET must be set");
  return verifyWithSecret(token, JWT_REFRESH_SECRET);
}

async function signWithSecret(
  payload: Omit<JWTPayloadEdge, "iat" | "exp">,
  rawSecret: string,
  ttl: string
): Promise<string> {
  const secret = new TextEncoder().encode(rawSecret);
  return new SignJWT({
    userId: payload.userId,
    email: payload.email,
    role: payload.role,
    sessionId: payload.sessionId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(secret);
}

/**
 * Подписать access-токен в edge runtime. Нужен для silent-refresh в middleware,
 * чтобы не делать 302-редирект на /api/auth/refresh.
 */
export async function signAccessTokenEdge(payload: Omit<JWTPayloadEdge, "iat" | "exp">): Promise<string> {
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) throw new Error("JWT_SECRET must be set");
  return signWithSecret(payload, JWT_SECRET, ACCESS_TTL_EDGE);
}

/**
 * Подписать refresh-токен в edge — для ротации refresh при каждом silent-refresh.
 */
export async function signRefreshTokenEdge(payload: Omit<JWTPayloadEdge, "iat" | "exp">): Promise<string> {
  const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
  if (!JWT_REFRESH_SECRET) throw new Error("JWT_REFRESH_SECRET must be set");
  return signWithSecret(payload, JWT_REFRESH_SECRET, REFRESH_TTL_EDGE);
}
