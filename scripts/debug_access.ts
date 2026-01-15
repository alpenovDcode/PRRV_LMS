
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function checkAccess(email: string, courseSlug: string) {
  console.log(`Checking access for user: ${email} in course: ${courseSlug}`);

  const user = await db.user.findUnique({
    where: { email },
    include: {
      groupMembers: true,
    }
  });

  if (!user) {
    console.error("User not found!");
    return;
  }

  console.log(`User ID: ${user.id}`);
  console.log(`Role: ${user.role}`);
  console.log(`Tariff: ${user.tariff}`);
  console.log(`Track: ${user.track}`);
  console.log(`Groups: ${user.groupMembers.map(g => g.groupId).join(', ')}`);

  const course = await db.course.findUnique({
    where: { slug: courseSlug },
    include: {
      modules: {
        orderBy: { orderIndex: 'asc' },
        include: { lessons: true }
      }
    }
  });

  if (!course) {
    console.error("Course not found!");
    return;
  }

  const enrollment = await db.enrollment.findUnique({
    where: {
      userId_courseId: {
        userId: user.id,
        courseId: course.id,
      }
    }
  });

  if (!enrollment) {
    console.error("Enrollment not found!");
    return;
  }

  console.log(`\nEnrollment Status: ${enrollment.status}`);
  // @ts-ignore
  console.log(`Restricted Modules (DB):`, enrollment.restrictedModules);
  // @ts-ignore
  console.log(`Restricted Lessons (DB):`, enrollment.restrictedLessons);

  console.log(`\n--- MODULE ANALYSIS ---`);
  
  for (const module of course.modules) {
    console.log(`\nModule: "${module.title}" (ID: ${module.id})`);
    
    // 1. Restricted List Check
    // @ts-ignore
    const isRestrictedExplicitly = enrollment.restrictedModules && enrollment.restrictedModules.includes(module.id);
    console.log(`   [Check 1] Is in Restricted List? ${isRestrictedExplicitly ? 'YES (HIDDEN)' : 'NO'}`);

    // 2. Tariff Check
    let tariffCheck = true;
    if (module.allowedTariffs && module.allowedTariffs.length > 0) {
      // @ts-ignore
      tariffCheck = user.tariff && module.allowedTariffs.includes(user.tariff);
      console.log(`   [Check 2] Tariff Check: User '${user.tariff}' vs Allowed ${JSON.stringify(module.allowedTariffs)} -> ${tariffCheck ? 'PASS' : 'FAIL (HIDDEN)'}`);
    } else {
        console.log(`   [Check 2] Tariff Check: No restrictions -> PASS`);
    }

    // 3. Track Check
    let trackCheck = true;
    if (module.allowedTracks && module.allowedTracks.length > 0) {
      // @ts-ignore
      trackCheck = user.track && module.allowedTracks.includes(user.track);
      console.log(`   [Check 3] Track Check: User '${user.track}' vs Allowed ${JSON.stringify(module.allowedTracks)} -> ${trackCheck ? 'PASS' : 'FAIL (HIDDEN)'}`);
    } else {
        console.log(`   [Check 3] Track Check: No restrictions -> PASS`);
    }

    // Final Verdict
    if (isRestrictedExplicitly) {
        console.log(`   => RESULT: HIDDEN (Explicit Restriction)`);
    } else if (!tariffCheck) {
        console.log(`   => RESULT: HIDDEN (Tariff Mismatch)`);
    } else if (!trackCheck) {
        console.log(`   => RESULT: HIDDEN (Track Mismatch)`);
    } else {
        console.log(`   => RESULT: VISIBLE`);
    }
  }
}

// Run
const email = process.argv[2] || 'evgeni3ruslan5@gmail.com'; // Default to the debug user
const slug = process.argv[3] || 'proryv'; // Guessing slug, might need adjustment

checkAccess(email, slug)
  .catch(e => console.error(e))
  .finally(async () => {
    await db.$disconnect();
  });
