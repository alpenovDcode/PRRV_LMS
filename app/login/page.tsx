'use client';

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { loginSchema } from "@/lib/validations";
import { toast } from "sonner";

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { login, isLoggingIn } = useAuth();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = (values: LoginFormValues) => {
    login(
      { ...values },
      {
        onError: (error: any) => {
          const message =
            error?.response?.data?.error?.message ?? "Не удалось войти в систему";
          toast.error(message);
        },
      }
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-10 md:flex-row">
          <div className="max-w-xl space-y-6">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl text-gray-900">
              Добро пожаловать в <span className="text-orange-500">Прорыв</span>
            </h1>
            <p className="text-lg text-gray-600">
              Продолжайте обучение с того места, где остановились. Интерфейс в духе
              лучших образовательных платформ: ваши курсы, прогресс и достижения — всё в одном месте.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-gray-600">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500"></span>
                Персональная лента обучения
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500"></span>
                Удобная навигация по курсам и урокам
              </li>
            </ul>
          </div>

          <Card className="w-full max-w-md shadow-xl border-gray-200 bg-white">
            <CardHeader>
              <CardTitle>Вход в систему</CardTitle>
              <CardDescription>
                Введите свои данные, чтобы продолжить обучение.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                className="space-y-4"
                onSubmit={form.handleSubmit(onSubmit)}
                noValidate
              >
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
                    autoComplete="current-password"
                    {...form.register("password")}
                  />
                  {form.formState.errors.password && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.password.message?.toString()}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between text-sm">
                  <Link
                    href="/recover-password"
                    className="text-sm font-medium text-orange-600 hover:text-orange-700 hover:underline"
                  >
                    Забыли пароль?
                  </Link>
                </div>

                <Button 
                  type="submit" 
                  className="mt-2 w-full bg-orange-500 hover:bg-orange-600 text-white" 
                  disabled={isLoggingIn}
                >
                  {isLoggingIn ? "Входим..." : "Войти"}
                </Button>
              </form>

              <div className="mt-4 text-center text-sm text-gray-600">
                Нет аккаунта?{" "}
                <Link href="/register" className="font-medium text-orange-600 hover:text-orange-700 hover:underline">
                  Зарегистрироваться
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

