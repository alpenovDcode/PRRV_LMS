const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

// Инициализируем Prisma. DATABASE_URL берется из системного окружения (process.env)
const prisma = new PrismaClient();

// Домен берется из переменных окружения или ставится по умолчанию
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://prrv.tech";

async function main() {
  console.log("Fetching courses and lessons from database...");
  
  const courses = await prisma.course.findMany({
    where: {
      isPublished: true,
    },
    include: {
      modules: {
        include: {
          lessons: {
            orderBy: {
              orderIndex: "asc",
            },
          },
        },
        orderBy: {
          orderIndex: "asc",
        },
      },
    },
  });

  if (courses.length === 0) {
    console.log("No published courses found.");
    return;
  }

  const result = [];

  for (const course of courses) {
    const courseData = {
      courseTitle: course.title,
      courseUrl: `${APP_URL}/learn/${course.slug}`,
      modules: course.modules.map(module => ({
        moduleTitle: module.title,
        lessons: module.lessons.map(lesson => ({
          lessonTitle: lesson.title,
          lessonUrl: `${APP_URL}/learn/${course.slug}/${lesson.id}`
        }))
      }))
    };
    result.push(courseData);
    
    console.log(`Processed Course: ${course.title}`);
  }

  // Путь для сохранения JSON
  const outputPath = path.join(process.cwd(), "data", "lessons_links.json");
  
  // Создаем папку data, если её нет
  if (!fs.existsSync(path.dirname(outputPath))) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf-8");
  
  console.log("\n==================================================");
  console.log(`SUCCESS! Data saved to: ${outputPath}`);
  console.log(`Total courses processed: ${result.length}`);
  console.log("==================================================");
}

main()
  .catch((e) => {
    console.error("Error extracting lessons:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
