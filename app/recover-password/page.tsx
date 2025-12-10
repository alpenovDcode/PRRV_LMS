"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useState } from "react";
import { apiClient } from "@/lib/api-client";

const recoverSchema = z.object({
  email: z.string().email("Некорректный email"),
});

type RecoverFormValues = z.infer<typeof recoverSchema>;

export default function RecoverPasswordPage() {
  const [isSubmitted, setIsSubmitted] = useState(false);

  const form = useForm<RecoverFormValues>({
    resolver: zodResolver(recoverSchema),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = async (values: RecoverFormValues) => {
    try {
      await apiClient.post("/auth/recover-password", values);
      setIsSubmitted(true);
      toast.success("Инструкции по восстановлению пароля отправлены на email");
    } catch (error: any) {
      const message = error?.response?.data?.error?.message ?? "Произошла ошибка";
      toast.error(message);
    }
  };

  if (isSubmitted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background to-muted px-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader>
            <CardTitle>Проверьте почту</CardTitle>
            <CardDescription>
              Мы отправили инструкции по восстановлению пароля на указанный email.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Если письмо не пришло, проверьте папку &quot;Спам&quot; или попробуйте еще раз.
            </p>
            <div className="flex flex-col gap-2">
              <Button onClick={() => setIsSubmitted(false)} variant="outline" className="w-full">
                Отправить еще раз
              </Button>
              <Button asChild variant="ghost" className="w-full">
                <Link href="/login">Вернуться к входу</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background to-muted px-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader>
          <CardTitle>Восстановление пароля</CardTitle>
          <CardDescription>
            Введите email, привязанный к вашему аккаунту, и мы отправим инструкции по восстановлению.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                {...form.register("email")}
              />
              {form.formState.errors.email && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.email.message?.toString()}
                </p>
              )}
            </div>

            <Button type="submit" className="w-full">
              Отправить инструкции
            </Button>
          </form>

          <div className="mt-4 text-center text-sm">
            <Link href="/login" className="text-primary hover:underline">
              Вернуться к входу
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
