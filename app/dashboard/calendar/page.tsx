"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useState } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from "date-fns";
import { ru } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Clock, CircleAlert, CircleCheck, Video } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface CalendarEvent {
  id: string;
  type: "lesson_available" | "homework_deadline" | "homework_soft_deadline" | "quiz_deadline" | "completed" | "live_webinar" | "qa_session";
  title: string;
  description?: string;
  date: string;
  time?: string;
  courseId: string;
  courseTitle: string;
  lessonId?: string;
  lessonTitle?: string;
  isCompleted?: boolean;
  isLate?: boolean;
  color: "pink" | "blue" | "green" | "purple";
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const { data: events = [] } = useQuery<CalendarEvent[]>({
    queryKey: ["calendar", "events", format(calendarStart, "yyyy-MM-dd"), format(calendarEnd, "yyyy-MM-dd")],
    queryFn: async () => {
      const response = await apiClient.get(
        `/calendar/events?startDate=${format(calendarStart, "yyyy-MM-dd")}&endDate=${format(calendarEnd, "yyyy-MM-dd")}`
      );
      const data = response.data.data;
      return Array.isArray(data) ? data : [];
    },
  });

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const today = new Date();
  const selectedDateEvents = selectedDate
    ? events.filter((e) => isSameDay(new Date(e.date), selectedDate))
    : [];

  const upcomingEvents = events
    .filter((e) => {
      const eventDate = new Date(e.date + (e.time ? `T${e.time}` : "T00:00"));
      return eventDate >= today;
    })
    .slice(0, 5);

  const todayEvents = events.filter((e) => isSameDay(new Date(e.date), today));

  const getEventsForDate = (date: Date) => {
    return events.filter((e) => isSameDay(new Date(e.date), date));
  };

  const getEventLabel = (event: CalendarEvent) => {
    if (event.type === "homework_deadline" || event.type === "homework_soft_deadline") {
      return "Сдача...";
    }
    if (event.type === "quiz_deadline") {
      return "Тест: ...";
    }
    if (event.type === "live_webinar") {
      return "Живо...";
    }
    if (event.type === "qa_session") {
      return "Q&A c...";
    }
    if (event.type === "completed") {
      return "Сдача...";
    }
    return "";
  };

  const getEventColor = (event: CalendarEvent) => {
    if (event.isCompleted) return "bg-green-100 text-green-700 border-green-300";
    if (event.color === "pink") return "bg-pink-100 text-pink-700 border-pink-300";
    if (event.color === "blue") return "bg-blue-100 text-blue-700 border-blue-300";
    if (event.color === "green") return "bg-green-100 text-green-700 border-green-300";
    return "bg-gray-100 text-gray-700 border-gray-300";
  };

  const getEventIcon = (event: CalendarEvent) => {
    if (event.isCompleted) return <CircleCheck className="h-4 w-4" />;
    if (event.type === "homework_deadline" || event.type === "homework_soft_deadline") {
      return <CircleAlert className="h-4 w-4" />;
    }
    if (event.type === "live_webinar" || event.type === "qa_session") {
      return <Video className="h-4 w-4" />;
    }
    return null;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Календарь</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Calendar */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl">
                  {format(currentDate, "LLLL yyyy", { locale: ru })}
                </CardTitle>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setCurrentDate(new Date())}
                    className="px-4 py-2 text-sm hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Сегодня
                  </button>
                  <button
                    onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Weekday headers */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => (
                  <div key={day} className="text-center text-sm font-medium text-gray-600 py-2">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1">
                {days.map((day) => {
                  const dayEvents = getEventsForDate(day);
                  const isToday = isSameDay(day, today);
                  const isSelected = selectedDate && isSameDay(day, selectedDate);
                  const isCurrentMonth = isSameMonth(day, currentDate);

                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelectedDate(day)}
                      className={cn(
                        "min-h-[80px] p-2 border rounded-lg text-left transition-colors",
                        !isCurrentMonth && "text-gray-300",
                        isToday && "ring-2 ring-purple-500 ring-offset-2",
                        isSelected && "bg-blue-50 border-blue-300",
                        !isSelected && !isToday && "hover:bg-gray-50"
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={cn(
                            "text-sm font-medium",
                            isToday && "bg-purple-500 text-white rounded-full w-6 h-6 flex items-center justify-center"
                          )}
                        >
                          {format(day, "d")}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {dayEvents.slice(0, 2).map((event) => (
                          <div
                            key={event.id}
                            className={cn(
                              "text-xs px-1 py-0.5 rounded truncate border",
                              getEventColor(event)
                            )}
                            title={event.title}
                          >
                            {getEventLabel(event)}
                          </div>
                        ))}
                        {dayEvents.length > 2 && (
                          <div className="text-xs text-gray-500">
                            +{dayEvents.length - 2}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Selected day events */}
          {selectedDate && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>
                  События на {format(selectedDate, "d MMMM", { locale: ru })}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedDateEvents.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">Нет событий на этот день</p>
                ) : (
                  <div className="space-y-3">
                    {selectedDateEvents.map((event) => (
                      <div
                        key={event.id}
                        className={cn(
                          "p-4 rounded-lg border",
                          getEventColor(event)
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5">{getEventIcon(event)}</div>
                          <div className="flex-1">
                            <h3 className="font-semibold">{event.title}</h3>
                            <p className="text-sm opacity-80 mt-1">{event.description || event.courseTitle}</p>
                            {event.time && (
                              <div className="flex items-center gap-1 text-sm mt-2">
                                <Clock className="h-3 w-3" />
                                {event.time}
                              </div>
                            )}
                            {event.lessonId && (
                              <Link
                                href={`/courses/${event.courseId}/lessons/${event.lessonId}`}
                                className="text-sm underline mt-2 inline-block"
                              >
                                Перейти к уроку →
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* Today Summary */}
          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
            <CardHeader>
              <CardTitle className="text-white">Сегодня</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <CircleAlert className="h-6 w-6" />
                <div>
                  <p className="text-sm opacity-90">Активных заданий</p>
                  <p className="text-3xl font-bold">{todayEvents.filter(e => !e.isCompleted).length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Upcoming Events */}
          <Card>
            <CardHeader>
              <CardTitle>Предстоящие события</CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingEvents.length === 0 ? (
                <p className="text-gray-500 text-center py-4 text-sm">Нет предстоящих событий</p>
              ) : (
                <div className="space-y-3">
                  {upcomingEvents.map((event) => (
                    <div
                      key={event.id}
                      className="p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5">{getEventIcon(event)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{event.title}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {format(new Date(event.date), "d MMM", { locale: ru })}
                            {event.time && ` в ${event.time}`}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Legend */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Обозначения</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-pink-100 border border-pink-300" />
                <span className="text-sm">Домашнее задание</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-blue-100 border border-blue-300" />
                <span className="text-sm">Вебинар/Событие</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-green-100 border border-green-300" />
                <span className="text-sm">Завершено</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-purple-500" />
                <span className="text-sm">Сегодня</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

