import { PrismaClient } from "@prisma/client";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";

import { generateAccessToken, generateSessionId } from "../lib/auth";

// Configuration
const BASE_URL = process.env.BASE_URL || "https://prrv.tech";
const USER_COUNT = 500;
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
  
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  
  // Create users AND their session IDs at the same time
  const usersData = Array.from({ length: USER_COUNT }).map((_, i) => ({
    email: `student${i}_${uuidv4().substring(0, 8)}@${TEST_EMAIL_DOMAIN}`,
    passwordHash,
    fullName: `Load Test Student ${i}`,
    emailVerified: true,
    role: "student" as const,
    sessionId: generateSessionId(), // Pre-generate session ID
  }));

  // Batch insert
  await prisma.user.createMany({
    data: usersData,
    skipDuplicates: true,
  });

  const users = await prisma.user.findMany({
    where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } },
    take: USER_COUNT,
  });

  console.log(`Created ${users.length} users successfully.`);
  return users;
}

// 2. "Login" Phase (Local Token Generation)
async function loginUser(user: any) {
  try {
    // Generate valid tokens locally using the server's secrets
    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionId: user.sessionId, // Must match DB
    };

    const accessToken = generateAccessToken(payload);
    // const refreshToken = generateRefreshToken(payload, "1d"); // Not strictly needed for short test

    // Simulate cookies
    const cookies = `accessToken=${accessToken}; Path=/; HttpOnly; SameSite=Strict`;
    
    return { ...user, cookies };
  } catch (e) {
    console.error(`Token generation error for ${user.email}`, e);
    return null;
  }
}

// 3. Action Phase
async function simulateUserAction(user: any, actionOverride?: { method: string, url: string }) {
  if (!user.cookies) return;

  let action = actionOverride;
  if (!action) {
     const actions = [
        { method: "GET", url: "/api/courses" }, 
     ];
     action = actions[0];
  }

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

    // 2. Login (now simplified to "prepare tokens")
    console.log("Preparing user sessions (generating tokens locally)...");
    const loggedInUsers = dbUsers.map(u => ({
        ...u,
        cookies: `accessToken=${generateAccessToken({
            userId: u.id,
            email: u.email,
            role: "student",
            sessionId: u.sessionId!
        })}; Path=/; HttpOnly; SameSite=Strict`
    }));
    
    console.log(`Ready to simulate actions for ${loggedInUsers.length} users.`);

// 3. Simulation
    const DURATION_SEC = 30;
    const endTime = Date.now() + DURATION_SEC * 1000;
    console.log(`Running actions for ${DURATION_SEC} seconds...`);
    
    // Get API Key from env (same as used in server)
    const API_KEY = process.env.API_SECRET_KEY; 

    while (Date.now() < endTime) {
      const batch = [];
      for (let i = 0; i < CONCURRENT_BATCH_SIZE; i++) {
        const randomUser = loggedInUsers[Math.floor(Math.random() * loggedInUsers.length)];
        if (randomUser) {
           // Append API Key to URLs
           const actionsWithKey = [
             { method: "GET", url: `/api/courses?apiKey=${API_KEY}` },
             { method: "GET", url: `/api/auth/me?apiKey=${API_KEY}` },
             { method: "GET", url: "/courses" }, // Public page, no API key needed
           ];
           
           const action = actionsWithKey[Math.floor(Math.random() * actionsWithKey.length)];
           
           batch.push(simulateUserAction(randomUser, action)); // Need to update simulateUserAction signature or just pass structure
        }
      }
      await Promise.all(batch);
      await sleep(100); 
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
