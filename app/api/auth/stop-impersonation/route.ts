import { NextRequest, NextResponse } from "next/server";
import { ApiResponse } from "@/types";
import { cookies } from "next/headers";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const originalAdminToken = cookieStore.get("originalAdminToken")?.value;

    if (!originalAdminToken) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: {
            code: "NO_SESSION",
            message: "Нет активной сессии администратора для восстановления",
          },
        },
        { status: 400 }
      );
    }

    // Восстанавливаем токен администратора
    const response = NextResponse.json<ApiResponse>(
      {
        success: true,
        data: {
          message: "Сессия администратора восстановлена",
        },
      },
      { status: 200 }
    );

    // Устанавливаем accessToken обратно на токен админа
    response.cookies.set("accessToken", originalAdminToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 24 часа
      path: "/",
    });

    // Удаляем cookie с оригинальным токеном
    response.cookies.delete("originalAdminToken");
    
    // Очищаем refreshToken текущего пользователя (чтобы не осталось хвостов)
    response.cookies.delete("refreshToken");

    return response;
  } catch (error) {
    console.error("Stop impersonation error:", error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Не удалось восстановить сессию администратора",
        },
      },
      { status: 500 }
    );
  }
}
