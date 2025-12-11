import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ApiResponse } from "@/types";
import { UserRole } from "@prisma/client";
import { adminUserCreateSchema } from "@/lib/validations";
import { hashPassword, generateSessionId } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { z } from "zod";

export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        const { searchParams } = new URL(request.url);
        const search = searchParams.get("search") || "";
        const role = searchParams.get("role") || "";
        const dateFrom = searchParams.get("dateFrom") || "";
        const dateTo = searchParams.get("dateTo") || "";

        const where: Record<string, any> = {};

        // Поиск по имени или email
        if (search) {
          where.OR = [
            { email: { contains: search, mode: "insensitive" } },
            { fullName: { contains: search, mode: "insensitive" } },
          ];
        }

        // Фильтр по роли
        if (role && ["student", "curator", "admin"].includes(role)) {
          where.role = role as UserRole;
        }

        // Фильтр по дате регистрации
        if (dateFrom || dateTo) {
          where.createdAt = {};
          if (dateFrom) {
            where.createdAt.gte = new Date(dateFrom);
          }
          if (dateTo) {
            // Устанавливаем конец дня для dateTo
            const endOfDay = new Date(dateTo);
            endOfDay.setHours(23, 59, 59, 999);
            where.createdAt.lte = endOfDay;
          }
        }

        const users = await db.user.findMany({
          where: Object.keys(where).length > 0 ? where : undefined,
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 200,
        });

        return NextResponse.json<ApiResponse>({ success: true, data: users }, { status: 200 });
      } catch (error) {
        console.error("Admin users error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось получить список пользователей",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}

export async function POST(request: NextRequest) {
  return withAuth(
    request,
    async (req) => {
      try {
        const body = await request.json();
        const { email, password, fullName, role } = adminUserCreateSchema.parse(body);

        // Проверяем, существует ли пользователь с таким email
        const existingUser = await db.user.findUnique({
          where: { email },
        });

        if (existingUser) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "USER_EXISTS",
                message: "Пользователь с таким email уже существует",
              },
            },
            { status: 409 }
          );
        }

        const passwordHash = await hashPassword(password);
        const sessionId = generateSessionId();

        const user = await db.user.create({
          data: {
            email,
            passwordHash,
            fullName,
            role: role as UserRole,
            sessionId,
            track: role === "student" ? (body.track as string) : undefined,
          },
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            createdAt: true,
          },
        });

        // Audit log
        await logAction(req.user!.userId, "CREATE_USER", "user", user.id, {
          email: user.email,
          role: user.role,
        });

        return NextResponse.json<ApiResponse>({ success: true, data: user }, { status: 201 });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return NextResponse.json<ApiResponse>(
            {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Некорректные данные пользователя",
                details: error.errors,
              },
            },
            { status: 400 }
          );
        }

        console.error("Create user error:", error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Не удалось создать пользователя",
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}


