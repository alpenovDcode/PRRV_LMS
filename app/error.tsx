"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home, RefreshCw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-muted px-4">
      <Card className="max-w-md w-full text-center">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <h1 className="text-2xl font-bold">Произошла ошибка</h1>
            <p className="text-muted-foreground">
              Что-то пошло не так. Попробуйте обновить страницу или вернуться на главную.
            </p>
            <div className="flex gap-2 justify-center pt-4">
              <Button onClick={reset}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Попробовать снова
              </Button>
              <Button variant="outline" asChild>
                <Link href="/dashboard">
                  <Home className="mr-2 h-4 w-4" />
                  На главную
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

