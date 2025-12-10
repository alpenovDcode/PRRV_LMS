import { jwtVerify } from "jose";
import { UserRole } from "@prisma/client";

export interface JWTPayloadEdge {
  userId: string;
  email: string;
  role: UserRole;
  sessionId: string;
  iat?: number;
  exp?: number;
}

export async function verifyAccessTokenEdge(token: string): Promise<JWTPayloadEdge | null> {
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET must be set");
  }

  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    
    // Type guard для проверки структуры payload
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
  } catch (error) {
    return null;
  }
}
