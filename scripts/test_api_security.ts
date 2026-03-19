
import axios from 'axios';
import * as dotenv from 'dotenv';
import path from 'path';

// Load .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const SECRET = process.env.API_SECRET_KEY;

async function test() {
  console.log(`Starting API Security Tests on: ${API_URL}`);
  console.log(`Secret Key found: ${SECRET ? 'YES' : 'NO'}`);

  const testCases = [
    {
      name: "1. Unauthorized (No credentials)",
      url: `${API_URL}/api/admin/courses`,
      config: {},
      expectedStatus: 401
    },
    {
      name: "2. Insecure Method (?apiKey=...)",
      url: `${API_URL}/api/admin/courses?apiKey=${SECRET}`,
      config: {},
      expectedStatus: 401
    },
    {
      name: "3. Valid API Key (Authorization Header)",
      url: `${API_URL}/api/admin/courses`,
      config: {
        headers: { Authorization: `Bearer ${SECRET}` }
      },
      expectedStatus: 200
    },
    {
      name: "4. Invalid API Key",
      url: `${API_URL}/api/admin/courses`,
      config: {
        headers: { Authorization: `Bearer wrong-key` }
      },
      expectedStatus: 401
    },
    {
      name: "5. Public Endpoint (No Auth)",
      url: `${API_URL}/api/landings/submit`,
      method: 'post',
      config: {
          data: { blockId: 'test', data: { email: 'test@example.com' } }
      },
      // We expect 400 or 404 because blockId 'test' doesn't exist, 
      // but importantly NOT 401.
      expectedStatus: [400, 404] 
    }
  ];

  for (const tc of testCases) {
    try {
      console.log(`\nRunning Test: ${tc.name}`);
      let res;
      if (tc.method === 'post') {
          res = await axios.post(tc.url, tc.config.data, tc.config);
      } else {
          res = await axios.get(tc.url, tc.config);
      }
      
      const status = res.status;
      const expected = Array.isArray(tc.expectedStatus) ? tc.expectedStatus : [tc.expectedStatus];
      
      if (expected.includes(status)) {
        console.log(`✅ PASS: Status ${status}`);
      } else {
        console.log(`❌ FAIL: Got ${status}, expected ${expected}`);
      }
    } catch (error: any) {
      const status = error.response?.status;
      const expected = Array.isArray(tc.expectedStatus) ? tc.expectedStatus : [tc.expectedStatus];
      
      if (status && expected.includes(status)) {
        console.log(`✅ PASS: Status ${status}`);
      } else {
        console.log(`❌ FAIL: Got ${status || 'Error'}, expected ${expected}`);
        if (!status) console.error(error.message);
      }
    }
  }
}

test();
