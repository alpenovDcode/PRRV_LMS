"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { OverviewCards } from "@/components/admin/analytics/overview-cards";
import { UserGrowthTable as UserGrowthChart } from "@/components/admin/analytics/user-growth-chart";
import { CoursePerformance } from "@/components/admin/analytics/course-performance";
import { HomeworkProgressChart } from "@/components/admin/analytics/homework-progress";
import { GroupLessonViewsChart } from "@/components/admin/analytics/group-lesson-views";
import { StudentsTable } from "@/components/admin/analytics/students-table";
import { StreamDetail, StreamData } from "@/components/admin/analytics/stream-detail";
import { SurveyAnalytics } from "@/components/admin/analytics/survey-analytics";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";

export default function AnalyticsPage() {
  const [range, setRange] = useState("30d");
  const [activeStream, setActiveStream] = useState<string | null>(null);

  const { data: overview, isLoading: isLoadingOverview } = useQuery({
    queryKey: ["admin", "analytics", "overview"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/analytics/overview");
      return response.data.data;
    },
  });

  const { data: userGrowth, isLoading: isLoadingUserGrowth } = useQuery({
    queryKey: ["admin", "analytics", "users", range],
    queryFn: async () => {
      const response = await apiClient.get(`/admin/analytics/users?range=${range}`);
      return response.data.data;
    },
  });

  const { data: courses, isLoading: isLoadingCourses } = useQuery({
    queryKey: ["admin", "analytics", "courses"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/analytics/courses");
      return response.data.data;
    },
  });

  const { data: homeworkData, isLoading: isLoadingHomework } = useQuery({
    queryKey: ["admin", "analytics", "homework"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/analytics/homework");
      return response.data.data;
    },
  });

  const { data: groupsData, isLoading: isLoadingGroups } = useQuery({
    queryKey: ["admin", "analytics", "groups"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/analytics/groups");
      return response.data.data;
    },
  });

  const { data: streamsData, isLoading: isLoadingStreams } = useQuery({
    queryKey: ["admin", "analytics", "streams"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/analytics/streams");
      return response.data.data as StreamData[];
    },
  });

  const { data: surveysData, isLoading: isLoadingSurveys } = useQuery({
    queryKey: ["admin", "analytics", "surveys"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/analytics/surveys");
      return response.data.data;
    },
  });

  const streams: StreamData[] = streamsData ?? [];
  const selectedStreamId = activeStream ?? streams[0]?.id ?? null;
  const selectedStream = streams.find((s) => s.id === selectedStreamId) ?? null;

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Аналитика</h2>
        <div className="flex items-center space-x-2">
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Выберите период" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Последние 7 дней</SelectItem>
              <SelectItem value="30d">Последние 30 дней</SelectItem>
              <SelectItem value="90d">Последние 3 месяца</SelectItem>
              <SelectItem value="all">За все время</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto flex-wrap gap-y-1">
          <TabsTrigger value="overview">Обзор</TabsTrigger>
          <TabsTrigger value="courses">Курсы</TabsTrigger>
          <TabsTrigger value="groups">Группы и ДЗ</TabsTrigger>
          <TabsTrigger value="streams">Потоки</TabsTrigger>
          <TabsTrigger value="surveys">Опросы / NPS</TabsTrigger>
          <TabsTrigger value="students">Продуктовая аналитика</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <OverviewCards data={overview} isLoading={isLoadingOverview} />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <UserGrowthChart data={userGrowth} isLoading={isLoadingUserGrowth} />
            <CoursePerformance data={courses} isLoading={isLoadingCourses} />
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <HomeworkProgressChart data={homeworkData} isLoading={isLoadingHomework} />
            <GroupLessonViewsChart data={streamsData} isLoading={isLoadingStreams} />
          </div>
        </TabsContent>

        <TabsContent value="courses" className="space-y-4">
          <CoursePerformance data={courses} isLoading={isLoadingCourses} />
        </TabsContent>

        <TabsContent value="groups" className="space-y-4">
          <GroupLessonViewsChart data={streamsData} isLoading={isLoadingStreams} />
          <HomeworkProgressChart data={homeworkData} isLoading={isLoadingHomework} />
        </TabsContent>

        {/* ===== НОВАЯ ВКЛАДКА: ПОТОКИ ===== */}
        <TabsContent value="streams" className="space-y-4">
          {isLoadingStreams ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : streams.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">Потоки не найдены</p>
          ) : (
            <Tabs
              value={selectedStreamId ?? undefined}
              onValueChange={(v) => setActiveStream(v)}
              className="space-y-4"
            >
              <TabsList className="flex-wrap gap-y-1 h-auto overflow-x-auto justify-start">
                {streams.map((s) => (
                  <TabsTrigger key={s.id} value={s.id} className="whitespace-nowrap">
                    {s.name}
                    <span className="ml-1.5 text-xs opacity-60">({s.memberCount})</span>
                  </TabsTrigger>
                ))}
              </TabsList>
              {streams.map((s) => (
                <TabsContent key={s.id} value={s.id}>
                  <StreamDetail data={s} />
                </TabsContent>
              ))}
            </Tabs>
          )}
        </TabsContent>

        {/* ===== НОВАЯ ВКЛАДКА: ОПРОСЫ / NPS ===== */}
        <TabsContent value="surveys" className="space-y-4">
          {isLoadingSurveys ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <SurveyAnalytics
              freeformSurveys={surveysData?.freeformSurveys ?? []}
              intermediateSurveys={surveysData?.intermediateSurveys ?? []}
              certificationForms={surveysData?.certificationForms ?? []}
            />
          )}
        </TabsContent>

        <TabsContent value="students" className="space-y-4">
          <StudentsTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}
