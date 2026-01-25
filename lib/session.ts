import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth";

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;

  if (!token) return null;

  try {
    const payload = verifyAccessToken(token);
    return payload;
  } catch {
    return null;
  }
}
