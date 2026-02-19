"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowLeft, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { defaultEmailTemplates } from "@/lib/default-email-templates";

const formSchema = z.object({
  name: z.string().min(1, "Название шаблона обязательно"),
  event: z.string().min(1, "Событие обязательно"),
  subject: z.string().min(1, "Тема письма обязательна"),
  body: z.string().min(1, "Тело письма обязательно"),
  isActive: z.boolean().default(false),
});

// Helper to get variables for a selected event
const getVariablesForEvent = (event: string) => {
  const template = defaultEmailTemplates.find((t) => t.event === event);
  return template?.variables || {};
};

// Available events from default templates
const availableEvents = defaultEmailTemplates.map((t) => ({
  value: t.event,
  label: t.name, // Using name as label (e.g. "Создание пользователя")
}));

export default function CreateEmailTemplatePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [copiedVar, setCopiedVar] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      event: "",
      subject: "",
      body: "",
      isActive: false,
    },
  });

  const selectedEvent = form.watch("event");
  const variables = getVariablesForEvent(selectedEvent);

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      await apiClient.post("/admin/email-templates", {
        ...values,
        variables, // Pass variables structure for reference
      });
    },
    onSuccess: () => {
      toast.success("Шаблон успешно создан");
      queryClient.invalidateQueries({ queryKey: ["admin", "email-templates"] });
      router.push("/admin/email-templates");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error?.message || "Ошибка при создании");
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

  const fillDefaults = () => {
    if (!selectedEvent) return;
    const template = defaultEmailTemplates.find((t) => t.event === selectedEvent);
    if (template) {
      form.setValue("subject", template.subject);
      form.setValue("body", template.body);
      form.setValue("name", `${template.name} (Копия)`);
    }
  };

  return (
    <div className="container mx-auto py-10 max-w-5xl">
      <div className="mb-6 flex items-center gap-4">
        <Link href="/admin/email-templates">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Создание шаблона</h1>
          <p className="text-muted-foreground text-sm">
            Создайте новый вариант письма для системного события
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Параметры шаблона</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="event"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Событие (Триггер)</FormLabel>
                        <Select
                          onValueChange={(val) => {
                            field.onChange(val);
                            // Optional: Reset or confirm before clearing body?
                          }}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Выберите событие" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {availableEvents.map((evt) => (
                              <SelectItem key={evt.value} value={evt.value}>
                                {evt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          При каком событии будет отправляться письмо
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {selectedEvent && (
                    <div className="flex justify-end">
                       <Button type="button" variant="outline" size="sm" onClick={fillDefaults}>
                         Заполнить стандартным текстом
                       </Button>
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Название шаблона</FormLabel>
                        <FormControl>
                          <Input placeholder="Например: Приветствие (Официальное)" {...field} />
                        </FormControl>
                        <FormDescription>
                          Для внутреннего использования в админке
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Активность</FormLabel>
                          <FormDescription>
                            Сделать этот шаблон основным для события (отключит другие)
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
                          Поддерживается HTML разметка.
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
                  Создать шаблон
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
              {!selectedEvent ? (
                <p className="text-sm text-muted-foreground">
                  Выберите событие, чтобы увидеть доступные переменные.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground mb-4">
                    Нажмите на переменную, чтобы скопировать её.
                  </p>
                  {Object.entries(variables).map(
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
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
