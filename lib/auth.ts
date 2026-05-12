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
  const { exp, iat, ...cleanPayload } = payload as any;
  return jwt.sign(cleanPayload, getJwtSecret(), {
    expiresIn: JWT_EXPIRES_IN as string,
  } as jwt.SignOptions);
}

export function generateRefreshToken(payload: JWTPayload, expiresIn?: string | number): string {
  const { exp, iat, ...cleanPayload } = payload as any;
  return jwt.sign(cleanPayload, getJwtRefreshSecret(), {
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
  // Источник истины — таблица UserSession. Каждое устройство = отдельная строка.
  const session = await db.userSession.findUnique({
    where: { userId_sessionId: { userId, sessionId } },
    select: { isActive: true },
  });

  if (session) return session.isActive;

  // Fallback на старое поле User.sessionId — нужно, чтобы при деплое
  // уже выпущенные access/refresh токены продолжали работать, пока
  // пользователь не залогинится заново и не появится строка в UserSession.
  // Можно убрать через ~30 дней после деплоя.
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { sessionId: true },
  });
  return !!user?.sessionId && user.sessionId === sessionId;
}

/**
 * Создаёт новую активную сессию (одно устройство = одна строка).
 * Не трогает User.sessionId, чтобы не выкидывать другие устройства.
 */
export async function createSession(
  userId: string,
  sessionId: string,
  meta?: { ipAddress?: string; userAgent?: string; deviceName?: string; deviceType?: string }
): Promise<void> {
  await db.userSession.upsert({
    where: { userId_sessionId: { userId, sessionId } },
    update: { isActive: true, lastActivityAt: new Date() },
    create: {
      userId,
      sessionId,
      isActive: true,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
      deviceName: meta?.deviceName,
      deviceType: meta?.deviceType,
    },
  });
}

/**
 * Деактивирует одну сессию (текущее устройство).
 */
export async function deactivateSession(userId: string, sessionId: string): Promise<void> {
  await db.userSession.updateMany({
    where: { userId, sessionId },
    data: { isActive: false },
  });
}

/**
 * Деактивирует все сессии пользователя. Используется при reset-password
 * и принудительной деактивации админом.
 */
export async function invalidateAllSessions(userId: string): Promise<void> {
  await db.userSession.updateMany({
    where: { userId, isActive: true },
    data: { isActive: false },
  });
  // Также чистим legacy-поле, чтобы fallback в validateSession не пропустил
  // старые токены после reset-password.
  await db.user.update({
    where: { id: userId },
    data: { sessionId: null },
  });
}

