"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CircleCheck, CircleX } from "lucide-react";

export default function LoginWithTokenPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Токен не найден в URL");
      return;
    }

    // Authenticate with token
    const apiKey = process.env.NEXT_PUBLIC_API_SECRET_KEY;
    const url = apiKey 
      ? `/api/auth/login-with-token?apiKey=${apiKey}`
      : "/api/auth/login-with-token";

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json();
        
        if (res.ok) {
          setStatus("success");
          setMessage("Вход выполнен успешно! Перенаправление...");
          
          // Redirect to dashboard after 1 second
          setTimeout(() => {
            router.push("/");
            router.refresh();
          }, 1000);
        } else {
          setStatus("error");
          setMessage(data.error || "Ошибка входа");
        }
      })
      .catch((error) => {
        console.error("Login error:", error);
        setStatus("error");
        setMessage("Произошла ошибка при входе");
      });
  }, [token, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Автоматический вход</CardTitle>
          <CardDescription>
            {status === "loading" && "Выполняется вход в систему..."}
            {status === "success" && "Вход выполнен успешно"}
            {status === "error" && "Ошибка входа"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {status === "loading" && (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
              <p className="text-sm text-gray-600">Проверка токена...</p>
            </>
          )}
          
          {status === "success" && (
            <>
              <CircleCheck className="h-12 w-12 text-green-600" />
              <p className="text-sm text-gray-600">{message}</p>
            </>
          )}
          
          {status === "error" && (
            <>
              <CircleX className="h-12 w-12 text-red-600" />
              <p className="text-sm text-gray-600">{message}</p>
              <p className="text-xs text-gray-500 mt-2">
                Возможные причины:
              </p>
              <ul className="text-xs text-gray-500 list-disc list-inside">
                <li>Токен истек (действителен 30 минут)</li>
                <li>Токен уже был использован</li>
                <li>Неверный токен</li>
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
