import { PrismaClient } from "@prisma/client";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";

// Configuration
const BASE_URL = process.env.BASE_URL || "https://prrv.tech";
const USER_COUNT = 100;
const TEST_EMAIL_DOMAIN = "loadtest.local";
const PASSWORD = "password123";
const CONCURRENT_BATCH_SIZE = 20;

const prisma = new PrismaClient();

// Stats
const stats = {
  requests: 0,
  success: 0,
  failed: 0,
  errors: {} as Record<string, number>,
  start: Date.now(),
};

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 1. Setup Phase
async function setupUsers() {
  console.log(`Creating ${USER_COUNT} test users in DB...`);
  
  // Generate a hash once to save time
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  
  const usersData = Array.from({ length: USER_COUNT }).map((_, i) => ({
    email: `student${i}_${uuidv4().substring(0, 8)}@${TEST_EMAIL_DOMAIN}`,
    passwordHash,
    fullName: `Load Test Student ${i}`,
    emailVerified: true,
    role: "student" as const, // Cast to enum if needed, but string works for createMany often if enum matches
  }));

  // Batch insert
  // Prisma createMany is supported on Postgres
  await prisma.user.createMany({
    data: usersData,
    skipDuplicates: true,
  });

  // Fetch back to get IDs if needed (though we just need credentials for login)
  // We can just use the emails we generated if we stored them, or query them back.
  // Let's just retrieve them to be sure.
  const users = await prisma.user.findMany({
    where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } },
    take: USER_COUNT,
  });

  console.log(`Created ${users.length} users successfully.`);
  return users;
}

// 2. Login Phase
async function loginUser(user: any) {
  try {
    const response = await axios.post(
      `${BASE_URL}/api/auth/login`,
      {
        email: user.email,
        password: PASSWORD,
        rememberMe: false,
      },
      {
        headers: { "Content-Type": "application/json" },
        validateStatus: () => true, // Don't throw on 4xx/5xx
      }
    );

    if (response.status === 200) {
      // Capture cookies
      const cookies = response.headers["set-cookie"];
      return { ...user, cookies };
    } else {
      // console.error(`Login failed for ${user.email}: ${response.status}`);
      return null;
    }
  } catch (e) {
    console.error(`Login error for ${user.email}`, e);
    return null;
  }
}

// 3. Action Phase
async function simulateUserAction(user: any) {
  if (!user.cookies) return;

  const actions = [
    { method: "GET", url: "/api/courses" },
    { method: "GET", url: "/api/auth/me" },
    { method: "GET", url: "/courses" }, // Next.js page
    // Add more protected routes here
  ];

  const action = actions[Math.floor(Math.random() * actions.length)];

  try {
    stats.requests++;
    const response = await axios({
      method: action.method,
      url: `${BASE_URL}${action.url}`,
      headers: {
        Cookie: user.cookies,
      },
      timeout: 5000,
      validateStatus: (status) => status < 500, // Count 404/403 as "handled" but maybe not success?
    });

    if (response.status >= 200 && response.status < 400) {
      stats.success++;
    } else {
      stats.failed++;
      const msg = `Status ${response.status} on ${action.url}`;
      stats.errors[msg] = (stats.errors[msg] || 0) + 1;
    }
  } catch (error: any) {
    stats.failed++;
    const msg = error.message || "Unknown error";
    stats.errors[msg] = (stats.errors[msg] || 0) + 1;
  }
}

// 4. Cleanup Phase
async function cleanupUsers() {
  console.log("Cleaning up test users...");
  const result = await prisma.user.deleteMany({
    where: {
      email: {
        endsWith: `@${TEST_EMAIL_DOMAIN}`,
      },
    },
  });
  console.log(`Deleted ${result.count} test users.`);
}

// Main
async function runFullSimulation() {
  console.log(`Starting FULL simulation on ${BASE_URL}`);

  try {
    // 1. Setup
    const dbUsers = await setupUsers();

    // 2. Login
    console.log("Logging in users...");
    const loggedInUsers = [];
    // Limit concurrency for login too to avoid DDoS-ing self instantly
    for (let i = 0; i < dbUsers.length; i += CONCURRENT_BATCH_SIZE) {
        const batch = dbUsers.slice(i, i + CONCURRENT_BATCH_SIZE).map(loginUser);
        const results = await Promise.all(batch);
        loggedInUsers.push(...results.filter(u => u !== null));
        process.stdout.write(`.`);
    }
    console.log(`\nSuccessfully logged in: ${loggedInUsers.length}/${dbUsers.length}`);

    // 3. Simulation
    const DURATION_SEC = 30;
    const endTime = Date.now() + DURATION_SEC * 1000;
    console.log(`Running actions for ${DURATION_SEC} seconds...`);

    while (Date.now() < endTime) {
      const batch = [];
      for (let i = 0; i < CONCURRENT_BATCH_SIZE; i++) {
        const randomUser = loggedInUsers[Math.floor(Math.random() * loggedInUsers.length)];
        if (randomUser) {
          batch.push(simulateUserAction(randomUser));
        }
      }
      await Promise.all(batch);
      await sleep(100); // Slight delay
    }

    // Report
    const duration = (Date.now() - stats.start) / 1000;
    console.log("\n--- Simulation Results ---");
    console.log(`Total Requests: ${stats.requests}`);
    console.log(`Successful: ${stats.success}`);
    console.log(`Failed: ${stats.failed}`);
    console.log(`RPS: ${(stats.requests / duration).toFixed(2)}`);
    console.log("Errors:", stats.errors);

  } catch (error) {
    console.error("Simulation failed:", error);
  } finally {
    // 4. Cleanup
    await cleanupUsers();
    await prisma.$disconnect();
  }
}

runFullSimulation();
