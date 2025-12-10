import { db } from "@/lib/db";

export async function logAction(
  userId: string,
  action: string,
  entity: string,
  entityId?: string,
  details?: any
) {
  try {
    // Check if user exists before creating audit log
    const userExists = await db.user.findUnique({
      where: { id: userId },
      select: { id: true }
    });

    if (!userExists) {
      console.warn(`Skipping audit log: user ${userId} not found`);
      return null;
    }

    return await db.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        details: details || {},
      },
    });
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Don't throw - audit logging should not break the main flow
    return null;
  }
}
