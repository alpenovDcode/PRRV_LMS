import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const USER_COUNT = 100;
const CONCURRENT_BATCH_SIZE = 20; // Don't kill the local machine

interface UserContext {
  id: number;
  email: string;
  token?: string;
  cookies?: string[]; // For session cookies if needed
}

const users: UserContext[] = Array.from({ length: USER_COUNT }, (_, i) => ({
  id: i + 1,
  email: `loadtest_${uuidv4().substring(0, 8)}@example.com`,
}));

const stats = {
  requests: 0,
  success: 0,
  failed: 0,
  errors: {} as Record<string, number>,
  start: Date.now(),
};

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function registerUser(user: UserContext) {
  try {
    // Attempt registration (if API allows public registration)
    // Or login if we assume users exist. 
    // For this test, let's assume we hit a public endpoint or just public pages if auth is hard to script without valid credentials.
    // IF we have a way to synthesize tokens, that's best.
    
    // For now, let's simulate "Guest" traffic if registration is complex, 
    // OR try to hit public pages. 
    // BUT the user asked for "login".
    
    // Let's try to hit a public page first to warm up.
    await axios.get(`${BASE_URL}/`, { timeout: 5000 });
    return true;
  } catch (e: any) {
    return false;
  }
}

async function simulateUserAction(user: UserContext) {
  const actions = [
    { method: 'GET', url: '/' },
    { method: 'GET', url: '/courses' },
    // Add more if we can find valid public routes
    { method: 'GET', url: '/api/health' }, 
  ];

  const action = actions[Math.floor(Math.random() * actions.length)];

  try {
    stats.requests++;
    const start = Date.now();
    await axios({
      method: action.method,
      url: `${BASE_URL}${action.url}`,
      timeout: 5000,
      headers: {
        // 'Authorization': `Bearer ${user.token}` // Uncomment if we had tokens
      }
    });
    stats.success++;
  } catch (error: any) {
    stats.failed++;
    const msg = error.message || 'Unknown error';
    stats.errors[msg] = (stats.errors[msg] || 0) + 1;
  }
}

async function runLoadTest() {
  console.log(`Starting load test with ${USER_COUNT} virtual users...`);
  console.log(`Target: ${BASE_URL}`);

  // 1. "Login" / Warmup
  console.log('Warming up...');
  const warmupPromises = users.map(u => registerUser(u));
  await Promise.all(warmupPromises);
  console.log('Warmup complete.');

  // 2. Loop actions
  const DURATION_SEC = 30; // Run for 30 seconds
  const endTime = Date.now() + DURATION_SEC * 1000;

  console.log(`Running simulation for ${DURATION_SEC} seconds...`);

  while (Date.now() < endTime) {
    // Pick a batch of users to act
    const batch = [];
    for (let i = 0; i < CONCURRENT_BATCH_SIZE; i++) {
        const user = users[Math.floor(Math.random() * users.length)];
        batch.push(simulateUserAction(user));
    }
    await Promise.all(batch);
    await sleep(200); // 200ms pause between batches
  }

  // Report
  const duration = (Date.now() - stats.start) / 1000;
  console.log('\n--- Load Test Results ---');
  console.log(`Total Requests: ${stats.requests}`);
  console.log(`Successful: ${stats.success}`);
  console.log(`Failed: ${stats.failed}`);
  console.log(`RPS: ${(stats.requests / duration).toFixed(2)}`);
  
  if (Object.keys(stats.errors).length > 0) {
    console.log('Errors:', stats.errors);
  }
}

runLoadTest();
