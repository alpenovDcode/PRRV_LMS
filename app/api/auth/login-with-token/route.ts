import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { sign } from "jsonwebtoken";
import { cookies } from "next/headers";

const loginWithTokenSchema = z.object({
  token: z.string().min(1),
});

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token } = loginWithTokenSchema.parse(body);

    // Find login token
    const loginToken = await prisma.loginToken.findUnique({
      where: { token },
      include: { user: true },
    });

    // Validate token exists
    if (!loginToken) {
      return NextResponse.json(
        { error: "Неверный токен" },
        { status: 401 }
      );
    }

    // Check if token is already used
    if (loginToken.used) {
      return NextResponse.json(
        { error: "Токен уже был использован" },
        { status: 401 }
      );
    }

    // Check if token is expired
    if (new Date() > loginToken.expiresAt) {
      return NextResponse.json(
        { error: "Токен истек" },
        { status: 401 }
      );
    }

    // Mark token as used
    await prisma.loginToken.update({
      where: { id: loginToken.id },
      data: {
        used: true,
        usedAt: new Date(),
      },
    });

    // Generate JWT for the user
    const jwtToken = sign(
      {
        userId: loginToken.user.id,
        email: loginToken.user.email,
        role: loginToken.user.role,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Set cookie
    const cookieStore = await cookies();
    cookieStore.set("auth-token", jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return NextResponse.json({
      success: true,
      user: {
        id: loginToken.user.id,
        email: loginToken.user.email,
        fullName: loginToken.user.fullName,
        role: loginToken.user.role,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Error logging in with token:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
