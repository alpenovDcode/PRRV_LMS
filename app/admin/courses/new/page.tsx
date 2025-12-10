"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { courseSchema } from "@/lib/validations";
import { slugify } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

type CourseFormValues = z.infer<typeof courseSchema>;

export default function AdminNewCoursePage() {
  const router = useRouter();
  const form = useForm<CourseFormValues>({
    resolver: zodResolver(courseSchema),
    defaultValues: {
      title: "",
      slug: "",
      description: "",
      coverImage: "",
      isPublished: false,
    },
  });

  const onSubmit = async (values: CourseFormValues) => {
    try {
      const payload = {
        ...values,
        slug: values.slug || slugify(values.title),
      };
      const response = await apiClient.post("/admin/courses", payload);
      toast.success("Курс создан");
      const courseId = response.data.data.id as string;
      router.push(`/admin/courses/${courseId}/builder`);
    } catch (error: any) {
      const message =
        error?.response?.data?.error?.message || "Не удалось создать курс";
      toast.error(message);
    }
  };

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Новый курс</h1>
        <p className="text-muted-foreground mt-1">
          Заполните основные данные. Структуру (модули и уроки) вы сможете настроить позже
          в конструкторе.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Основная информация</CardTitle>
          <CardDescription>Название, slug и описание курса.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Название курса</Label>
              <Input
                id="title"
                {...form.register("title")}
                placeholder="Например: Продажи для начинающих"
              />
              {form.formState.errors.title && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.title.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                {...form.register("slug")}
                placeholder="budet-sgenerirovan-avtomaticheski"
              />
              <p className="text-xs text-muted-foreground">
                URL-часть для курса. Если оставить пустым, будет сгенерирован из названия.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Описание</Label>
              <Input
                id="description"
                {...form.register("description")}
                placeholder="Краткое описание курса (опционально)"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="coverImage">Обложка (URL)</Label>
              <Input
                id="coverImage"
                {...form.register("coverImage")}
                placeholder="https://..."
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="isPublished"
                checked={form.watch("isPublished")}
                onCheckedChange={(checked) =>
                  form.setValue("isPublished", Boolean(checked))
                }
              />
              <Label htmlFor="isPublished" className="text-sm">
                Сразу опубликовать курс
              </Label>
            </div>

            <Button type="submit" className="mt-4">
              Создать курс
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}


