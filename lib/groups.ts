import { db } from "@/lib/db";

export async function createGroup(data: { name: string; description?: string }) {
  return db.group.create({
    data,
  });
}

export async function updateGroup(id: string, data: { name?: string; description?: string; courseId?: string | null; startDate?: Date | null }) {
  return db.group.update({
    where: { id },
    data,
  });
}

export async function deleteGroup(id: string) {
  return db.group.delete({
    where: { id },
  });
}

export async function getGroup(id: string) {
  return db.group.findUnique({
    where: { id },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              avatarUrl: true,
            },
          },
        },
      },
    },
  });
}

export async function getGroups() {
  return db.group.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { members: true },
      },
    },
  });
}

export async function addMemberToGroup(groupId: string, userId: string) {
  try {
    return await db.groupMember.create({
      data: {
        groupId,
        userId,
      },
    });
  } catch (error: any) {
    if (error.code === "P2002") {
      throw new Error("User is already a member of this group");
    }
    throw error;
  }
}

export async function removeMemberFromGroup(groupId: string, userId: string) {
  return db.groupMember.deleteMany({
    where: {
      groupId,
      userId,
    },
  });
}

export async function getUserGroups(userId: string) {
  return db.groupMember.findMany({
    where: { userId },
    include: {
      group: true,
    },
  });
}
