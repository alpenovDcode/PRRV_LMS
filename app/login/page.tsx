'use client';

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
      rememberMe: false,
      consent: false,
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
              Добро пожаловать в <span className="text-orange-500">экосистему Прорыв</span>
            </h1>
            <p className="text-lg text-gray-600">
              Продолжайте обучение с того места, где остановились. Интерфейс в духе
              лучших образовательных платформ: ваши материалы, прогресс и достижения - всё в одном месте.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-gray-600">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500"></span>
                Персональная лента
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500"></span>
                Удобная навигация
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500"></span>
                ИИ-сервисы для репетиторов
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

                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="rememberMe" 
                    onCheckedChange={(checked) => {
                      form.setValue("rememberMe", checked as boolean);
                    }}
                    {...form.register("rememberMe")}
                  />
                  <Label 
                    htmlFor="rememberMe" 
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Запомнить меня
                  </Label>
                </div>

                <div className="flex items-top space-x-2">
                  <Checkbox 
                    id="consent" 
                    onCheckedChange={(checked) => {
                      form.setValue("consent", checked as boolean);
                    }}
                    {...form.register("consent")}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label 
                      htmlFor="consent" 
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Я соглашаюсь с{" "}
                      <Link href="/legal/privacy" className="underline hover:text-gray-900" target="_blank">
                        политикой конфиденциальности
                      </Link>
                    </Label>
                    {form.formState.errors.consent && (
                      <p className="text-sm text-destructive">
                        {form.formState.errors.consent.message?.toString()}
                      </p>
                    )}
                  </div>
                </div>



                <Button 
                  type="submit" 
                  className="mt-2 w-full bg-orange-500 hover:bg-orange-600 text-white" 
                  disabled={isLoggingIn}
                >
                  {isLoggingIn ? "Входим..." : "Войти"}
                </Button>
              </form>

              <div className="text-xs text-center text-gray-500 space-y-2 pt-4 border-t">
                <p>
                  Нажимая «Войти», вы соглашаетесь с{" "}
                  <Link href="/legal/offer" className="underline hover:text-gray-900" target="_blank">
                    Офертой
                  </Link>
                  {" "}и{" "}
                  <Link href="/legal/privacy" className="underline hover:text-gray-900" target="_blank">
                    Политикой конфиденциальности
                  </Link>
                </p>
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
                 <Link href="/legal/consent/processing" className="underline hover:text-gray-900" target="_blank">
                    Согласие на обработку данных
                  </Link>
                  <Link href="/legal/consent/mailing" className="underline hover:text-gray-900" target="_blank">
                    Согласие на рассылку
                  </Link>
                </div>
              </div>


            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

