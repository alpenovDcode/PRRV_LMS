import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-middleware';
import { db } from '@/lib/db';
import { UserRole } from '@prisma/client';
import { ApiResponse } from '@/types';

export async function GET(request: NextRequest) {
  return withAuth(
    request,
    async () => {
      try {
        // 1. Fetch students with their groups, progress, and homework
        const students = await db.user.findMany({
          where: {
            role: 'student',
          },
          select: {
            id: true,
            email: true,
            fullName: true,
            createdAt: true,
            track: true,
            groupMembers: {
              include: {
                group: {
                  select: {
                    id: true,
                    name: true,
                    courseId: true,
                    course: {
                      select: {
                        id: true,
                        title: true,
                      },
                    },
                  },
                },
              },
            },
            progress: {
              select: {
                lessonId: true,
                status: true,
                rating: true,
                completedAt: true,
                lesson: {
                  select: {
                    title: true,
                  },
                },
              },
            },
            homework: {
              select: {
                id: true,
                status: true,
                lessonId: true,
                createdAt: true,
                lesson: {
                  select: {
                    title: true,
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        });

        // 2. Get unique course IDs to fetch total lesson counts
        const courseIds = new Set<string>();
        students.forEach((student: any) => {
          student.groupMembers.forEach((gm: any) => {
            if (gm.group.courseId) {
              courseIds.add(gm.group.courseId);
            }
          });
        });

        // 3. Fetch courses with their lesson counts directly.
        const courses = await db.course.findMany({
          where: {
            id: {
              in: Array.from(courseIds),
            },
          },
          select: {
            id: true,
            modules: {
              select: {
                lessons: {
                  select: {
                    id: true,
                  },
                },
              },
            },
          },
        });

        const courseTotalLessons: Record<string, number> = {};
        courses.forEach((course: any) => {
          let count = 0;
          course.modules.forEach((module: any) => {
            count += module.lessons.length;
          });
          courseTotalLessons[course.id] = count;
        });

        // 4. Transform data for the frontend
        const analyticsData = students.map((student: any) => {
          // Assume primary group is the first one (or handle multiple)
          const primaryGroupMember = student.groupMembers[0];
          const groupName = primaryGroupMember?.group.name || 'Без группы';
          const courseTitle = primaryGroupMember?.group.course?.title || '-';
          const courseId = primaryGroupMember?.group.courseId;

          const totalLessons = courseId ? (courseTotalLessons[courseId] || 0) : 0;
          
          let completedLessons = 0;
          let submittedHomework = 0;
          let approvedHomework = 0;

          if (courseId) {
            const course = courses.find((c: any) => c.id === courseId);
            const courseLessonIds = new Set<string>();
            course?.modules.forEach((m: any) => m.lessons.forEach((l: any) => courseLessonIds.add(l.id)));

            completedLessons = student.progress.filter((p: any) => 
              courseLessonIds.has(p.lessonId) && p.status === 'completed'
            ).length;

            submittedHomework = student.homework.filter((h: any) => 
              courseLessonIds.has(h.lessonId)
            ).length;

            approvedHomework = student.homework.filter((h: any) => 
              courseLessonIds.has(h.lessonId) && h.status === 'approved'
            ).length;
          } else {
            // Fallback if no course assigned (just count all)
            completedLessons = student.progress.filter((p: any) => p.status === 'completed').length;
            submittedHomework = student.homework.length;
            approvedHomework = student.homework.filter((h: any) => h.status === 'approved').length;
          }

          const lessonProgressPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
          
          // Calculate student's average rating given
          const ratedLessons = student.progress.filter((p: any) => p.rating && p.rating > 0);
          const avgRating = ratedLessons.length > 0
            ? (ratedLessons.reduce((acc: number, curr: any) => acc + curr.rating, 0) / ratedLessons.length).toFixed(1)
            : '-';

          return {
            id: student.id,
            name: student.fullName || student.email,
            email: student.email,
            group: groupName,
            course: courseTitle,
            track: student.track || '-',
            totalLessons,
            completedLessons,
            lessonProgressPercent,
            submittedHomework,
            approvedHomework,
            avgRating,

            registrationDate: student.createdAt,
            detailedStats: {
              homeworks: student.homework.map((h: any) => ({
                id: h.id,
                lessonTitle: h.lesson.title,
                status: h.status,
                submittedAt: h.createdAt,
              })),
              ratings: student.progress
                .filter((p: any) => p.rating && p.rating > 0)
                .map((p: any) => ({
                  lessonTitle: p.lesson.title,
                  rating: p.rating,
                  ratedAt: p.completedAt || p.lastUpdated, // Fallback if completedAt is null
                })),
            },
          };
        });

        return NextResponse.json<ApiResponse>({ success: true, data: analyticsData });
      } catch (error) {
        console.error('Error fetching student analytics:', error);
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error: {
              code: 'INTERNAL_ERROR',
              message: 'Failed to fetch student analytics',
            },
          },
          { status: 500 }
        );
      }
    },
    { roles: [UserRole.admin] }
  );
}
