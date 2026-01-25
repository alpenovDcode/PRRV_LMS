"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

// TypeMap to handle dynamic prisma access safely
// We whitelist only models we want to expose to this "Database Manager"
const MODELS = {
  user: db.user,
  course: db.course,
  module: db.module,
  lesson: db.lesson,
  homework: db.homework,
  purchase: db.purchase,
  payment: db.payment,
  video: db.video,
  notification: db.notification,
  comment: db.comment,
};

type ModelName = keyof typeof MODELS;

// Helper for strict auth check
async function checkAdminAccess() {
    const user = await getCurrentUser();
    if (user?.role !== "admin") throw new Error("Unauthorized: Admin role required");

    const cookieStore = await cookies();
    const isUnlocked = cookieStore.get("admin_db_unlocked")?.value === "true";
    if (!isUnlocked) throw new Error("Unauthorized: Database access locked");
    
    return user;
}

export async function getDbTables() {
  await checkAdminAccess();
  return Object.keys(MODELS);
}

export async function getTableData(modelName: string, page = 1, pageSize = 20, search = "") {
  await checkAdminAccess();

  const model = MODELS[modelName as ModelName];
  if (!model) throw new Error("Invalid model");

  const skip = (page - 1) * pageSize;

  let where = {};
  if (search) {
      if (modelName === 'user') {
          where = {
              OR: [
                  { email: { contains: search, mode: 'insensitive' } },
                  { fullName: { contains: search, mode: 'insensitive' } },
                  { id: { contains: search, mode: 'insensitive' } }
              ]
          };
      } else if (['course', 'module', 'lesson', 'video'].includes(modelName)) {
           where = {
              OR: [
                  { title: { contains: search, mode: 'insensitive' } },
                  { id: { contains: search, mode: 'insensitive' } }
              ]
           };
      }
  }

  try {
    // @ts-ignore - dynamic prisma access
    const [data, total] = await Promise.all([
      model.findMany({
        skip,
        take: pageSize,
        where: search ? where : undefined,
        orderBy: { createdAt: 'desc' } 
      }),
      model.count({ where: search ? where : undefined })
    ]);

    return { data, total, page, pageSize };
  } catch (e: any) {
      // Fallback
      return { data: [], total: 0, page, pageSize, error: e.message };
  }
}

export async function updateRecord(modelName: string, id: string, data: any) {
  await checkAdminAccess();

  const model = MODELS[modelName as ModelName];
  if (!model) throw new Error("Invalid model");

  const { id: _, createdAt: __, updatedAt: ___, ...updateData } = data;

  try {
    // @ts-ignore
    const result = await model.update({
      where: { id },
      data: updateData,
    });
    
    revalidatePath("/admin/analytics/detailed");
    return { success: true, data: result };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function deleteRecord(modelName: string, id: string) {
    await checkAdminAccess();
  
    const model = MODELS[modelName as ModelName];
    if (!model) throw new Error("Invalid model");

    try {
        // @ts-ignore
        await model.delete({ where: { id } });
        revalidatePath("/admin/analytics/detailed");
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
