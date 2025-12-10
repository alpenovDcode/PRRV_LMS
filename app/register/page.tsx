"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { registerSchema } from "@/lib/validations";
import { toast } from "sonner";
import { useState } from "react";

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const { register: registerUser, isRegistering } = useAuth();
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      fullName: "",
    },
  });

  const onSubmit = (values: RegisterFormValues) => {
    if (!agreedToTerms) {
      toast.error("Необходимо согласиться с условиями использования");
      return;
    }

    registerUser(values, {
      onError: (error: any) => {
        const message = error?.response?.data?.error?.message ?? "Не удалось зарегистрироваться";
        toast.error(message);
      },
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-background to-muted">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-10 md:flex-row">
          <div className="max-w-xl space-y-4">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              Присоединяйтесь к <span className="text-primary">Прорыв.ру</span>
            </h1>
            <p className="text-lg text-muted-foreground">
              Начните свой путь обучения уже сегодня. Создайте аккаунт и получите доступ к курсам.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>· Персональная программа обучения</li>
              <li>· Отслеживание прогресса</li>
              <li>· Сертификаты и достижения</li>
            </ul>
          </div>

          <Card className="w-full max-w-md shadow-xl">
            <CardHeader>
              <CardTitle>Создать аккаунт</CardTitle>
              <CardDescription>Заполните форму, чтобы начать обучение.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
                <div className="space-y-2">
                  <Label htmlFor="fullName">Имя</Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="Иван Иванов"
                    autoComplete="name"
                    {...form.register("fullName")}
                  />
                  {form.formState.errors.fullName && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.fullName.message?.toString()}
                    </p>
                  )}
                </div>

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

                <div className="space-y-2">
                  <Label htmlFor="password">Пароль</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Минимум 6 символов"
                    autoComplete="new-password"
                    {...form.register("password")}
                  />
                  {form.formState.errors.password && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.password.message?.toString()}
                    </p>
                  )}
                </div>

                <div className="flex items-start space-x-2">
                  <input
                    type="checkbox"
                    id="terms"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="terms" className="text-sm leading-relaxed">
                    Я согласен с{" "}
                    <Link href="/legal/privacy" className="text-primary hover:underline">
                      политикой конфиденциальности
                    </Link>{" "}
                    и{" "}
                    <Link href="/legal/terms" className="text-primary hover:underline">
                      условиями использования
                    </Link>
                  </Label>
                </div>

                <Button type="submit" className="mt-2 w-full" disabled={isRegistering || !agreedToTerms}>
                  {isRegistering ? "Регистрируем..." : "Зарегистрироваться"}
                </Button>
              </form>

              <div className="mt-4 text-center text-sm text-muted-foreground">
                Уже есть аккаунт?{" "}
                <Link href="/login" className="font-medium text-primary hover:underline">
                  Войти
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
