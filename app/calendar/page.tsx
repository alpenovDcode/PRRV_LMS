"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, BookOpen } from "lucide-react";
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  isToday,
  parseISO
} from "date-fns";
import { ru } from "date-fns/locale";
import Link from "next/link";

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: "lesson_open" | "deadline_homework" | "deadline_soft" | "deadline_hard";
  courseTitle: string;
  lessonId: string;
  slug: string;
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const { data: events = [], isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ["calendar", "events"],
    queryFn: async () => {
      const response = await apiClient.get("/api/calendar");
      return response.data.data;
    },
  });

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  };

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { locale: ru });
  const endDate = endOfWeek(monthEnd, { locale: ru });

  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

  const getEventsForDay = (day: Date) => {
    return events.filter(event => isSameDay(parseISO(event.date), day));
  };

  const selectedDayEvents = getEventsForDay(selectedDate);

  const getEventColor = (type: CalendarEvent["type"]) => {
    switch (type) {
      case "lesson_open": return "bg-blue-500";
      case "deadline_homework": return "bg-purple-500";
      case "deadline_soft": return "bg-orange-500";
      case "deadline_hard": return "bg-red-500";
      default: return "bg-gray-500";
    }
  };

  const getEventLabel = (type: CalendarEvent["type"]) => {
    switch (type) {
      case "lesson_open": return "Открытие урока";
      case "deadline_homework": return "Дедлайн ДЗ";
      case "deadline_soft": return "Мягкий дедлайн";
      case "deadline_hard": return "Жесткий дедлайн";
      default: return "Событие";
    }
  };
  
  const getBadgeVariant = (type: CalendarEvent["type"]) => {
      switch (type) {
      case "lesson_open": return "bg-blue-100 text-blue-700 hover:bg-blue-200";
      case "deadline_homework": return "bg-purple-100 text-purple-700 hover:bg-purple-200";
      case "deadline_soft": return "bg-orange-100 text-orange-700 hover:bg-orange-200";
      case "deadline_hard": return "bg-red-100 text-red-700 hover:bg-red-200";
      default: return "bg-gray-100 text-gray-700 hover:bg-gray-200";
    }
  };

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
          <CalendarIcon className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Календарь обучения</h1>
          <p className="text-gray-600">График открытия уроков и дедлайны</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <Card className="h-fit">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-xl font-semibold capitalize">
              {format(currentDate, "LLLL yyyy", { locale: ru })}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={prevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={goToToday}>
                Сегодня
              </Button>
              <Button variant="outline" size="icon" onClick={nextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Week days header */}
            <div className="grid grid-cols-7 mb-2">
              {weekDays.map((day) => (
                <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day) => {
                const dayEvents = getEventsForDay(day);
                const isSelected = isSameDay(day, selectedDate);
                const isCurrentMonth = isSameMonth(day, currentDate);
                const isTodayDate = isToday(day);

                return (
                  <button
                    key={day.toString()}
                    onClick={() => setSelectedDate(day)}
                    className={`
                      min-h-[80px] p-2 rounded-lg border flex flex-col items-start justify-start transition-colors relative
                      ${isSelected ? "ring-2 ring-blue-600 ring-offset-2 z-10" : ""}
                      ${isCurrentMonth ? "bg-white" : "bg-gray-50 text-gray-400"}
                      ${isTodayDate ? "bg-blue-50 border-blue-200" : "border-gray-100 hover:border-gray-300"}
                    `}
                  >
                    <span className={`text-sm font-medium ${isTodayDate ? "text-blue-700" : ""}`}>
                      {format(day, "d")}
                    </span>
                    
                    <div className="mt-1 flex flex-wrap gap-1 w-full">
                      {dayEvents.slice(0, 3).map((event) => (
                        <div 
                          key={event.id} 
                          className={`w-full h-1.5 rounded-full ${getEventColor(event.type)}`}
                          title={event.title}
                        />
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="text-[10px] text-gray-500">+{dayEvents.length - 3}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-lg">
              События на {format(selectedDate, "d MMMM", { locale: ru })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : selectedDayEvents.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>Нет событий на этот день</p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedDayEvents.map((event) => (
                  <Link 
                    href={`/learn/${event.slug}/${event.lessonId}`} 
                    key={event.id}
                    className="block group"
                  >
                    <div className="rounded-lg border border-gray-200 p-3 hover:bg-gray-50 transition-colors hover:border-blue-300">
                      <div className="flex items-start justify-between mb-1">
                        <Badge variant="secondary" className={getBadgeVariant(event.type)}>
                          {getEventLabel(event.type)}
                        </Badge>
                        <span className="text-xs text-gray-500">
                          {format(parseISO(event.date), "HH:mm")}
                        </span>
                      </div>
                      <h4 className="font-medium text-gray-900 group-hover:text-blue-700 transition-colors">
                        {event.title}
                      </h4>
                      <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
                        <BookOpen className="h-3 w-3" />
                        <span>{event.courseTitle}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
