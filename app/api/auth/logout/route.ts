import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-middleware";
import { deactivateSession } from "@/lib/auth";
import { ApiResponse } from "@/types";

export async function POST(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      // Деактивируем ТОЛЬКО текущее устройство. Остальные сессии пользователя
      // остаются активными — иначе выход на телефоне выкидывает с компа.
      await deactivateSession(req.user!.userId, req.user!.sessionId);

      const response = NextResponse.json<ApiResponse>(
        {
          success: true,
          data: { message: "Выход выполнен успешно" },
        },
        { status: 200 }
      );

      // Удаляем все auth cookies с теми же параметрами, что и при установке
      response.cookies.set("refreshToken", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 0,
        path: "/",
      });
      response.cookies.set("accessToken", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 0,
        path: "/",
      });

      return response;
    } catch (error) {
      console.error("Logout error:", error);
      // Even if DB fails, we should clear cookies to allow user to "logout" locally
      const response = NextResponse.json<ApiResponse>(
        {
          success: true, // We pretend success to client so they redirect
          data: { message: "Выход выполнен (локально)" },
        },
        { status: 200 }
      );
      
      response.cookies.set("refreshToken", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 0,
        path: "/",
      });
      response.cookies.set("accessToken", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 0,
        path: "/",
      });

      return response;
    }
  });
}

