"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowLeft, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

const formSchema = z.object({
  subject: z.string().min(1, "Тема письма обязательна"),
  body: z.string().min(1, "Тело письма обязательно"),
  isActive: z.boolean().default(true),
});

interface TemplateData {
  id: string;
  name: string;
  event: string;
  subject: string;
  body: string;
  variables: Record<string, string>;
  isActive: boolean;
}

export default function EditEmailTemplatePage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [copiedVar, setCopiedVar] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      subject: "",
      body: "",
      isActive: true,
    },
  });

  const { data: template, isLoading } = useQuery<TemplateData>({
    queryKey: ["admin", "email-template", params.id],
    queryFn: async () => {
      const response = await apiClient.get(`/admin/email-templates/${params.id}`);
      return response.data.data;
    },
  });

  useEffect(() => {
    if (template) {
      form.reset({
        subject: template.subject,
        body: template.body,
        isActive: template.isActive,
      });
    }
  }, [template, form]);

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      await apiClient.put(`/admin/email-templates/${params.id}`, values);
    },
    onSuccess: () => {
      toast.success("Шаблон успешно обновлен");
      queryClient.invalidateQueries({ queryKey: ["admin", "email-templates"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "email-template", params.id] });
      router.push("/admin/email-templates");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error?.message || "Ошибка при сохранении");
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    mutation.mutate(values);
  };

  const copyToClipboard = (variable: string) => {
    navigator.clipboard.writeText(`{{${variable}}}`);
    setCopiedVar(variable);
    setTimeout(() => setCopiedVar(null), 2000);
    toast.success("Скопировано в буфер обмена");
  };

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!template) {
    return <div className="p-8 text-center">Шаблон не найден</div>;
  }

  return (
    <div className="container mx-auto py-10 max-w-5xl">
      <div className="mb-6 flex items-center gap-4">
        <Link href="/admin/email-templates">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{template.name}</h1>
          <p className="text-muted-foreground text-sm font-mono mt-1">
            Событие: {template.event}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Редактирование шаблона</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Активность</FormLabel>
                          <FormDescription>
                            Отправлять письма по этому шаблону
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="subject"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Тема письма</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="body"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Тело письма (HTML)</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            className="font-mono text-sm min-h-[400px]"
                          />
                        </FormControl>
                        <FormDescription>
                          Поддерживается HTML разметка. Используйте переменные из списка справа.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <div className="flex justify-end gap-2">
                <Link href="/admin/email-templates">
                  <Button variant="outline" type="button">
                    Отмена
                  </Button>
                </Link>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Сохранить изменения
                </Button>
              </div>
            </form>
          </Form>
        </div>

        <div>
          <Card className="sticky top-24">
            <CardHeader>
              <CardTitle className="text-lg">Доступные переменные</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Нажмите на переменную, чтобы скопировать её в буфер обмена.
              </p>
              <div className="space-y-2">
                {Object.entries(template.variables as Record<string, string>).map(
                  ([key, description]) => (
                    <div
                      key={key}
                      className="group flex items-center justify-between rounded-md border p-2 hover:bg-muted cursor-pointer transition-colors"
                      onClick={() => copyToClipboard(key)}
                    >
                      <div className="flex flex-col">
                        <code className="text-sm font-semibold text-primary">
                          {`{{${key}}}`}
                        </code>
                        <span className="text-xs text-muted-foreground">
                          {description}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                         {copiedVar === key ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                  )
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
