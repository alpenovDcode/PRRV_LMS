import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "./db";
import { UserRole } from "@prisma/client";
import { randomBytes } from "crypto";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET must be set");
  }
  return secret;
}

function getJwtRefreshSecret(): string {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new Error("JWT_REFRESH_SECRET must be set");
  }
  return secret;
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "30m";
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "7d";

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  sessionId: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateSessionId(): string {
  return randomBytes(32).toString("hex");
}

export function generateAccessToken(payload: JWTPayload): string {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: JWT_EXPIRES_IN as string,
  } as jwt.SignOptions);
}

export function generateRefreshToken(payload: JWTPayload, expiresIn?: string | number): string {
  return jwt.sign(payload, getJwtRefreshSecret(), {
    expiresIn: expiresIn || (JWT_REFRESH_EXPIRES_IN as string),
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as unknown as JWTPayload;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, getJwtRefreshSecret()) as unknown as JWTPayload;
  } catch {
    return null;
  }
}

export async function validateSession(userId: string, sessionId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { sessionId: true },
  });

  return user?.sessionId === sessionId;
}

export async function invalidateAllSessions(userId: string): Promise<void> {
  const newSessionId = generateSessionId();
  await db.user.update({
    where: { id: userId },
    data: { sessionId: newSessionId },
  });
}

