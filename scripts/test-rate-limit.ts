import axios from 'axios';

const API_URL = 'http://localhost:3000/api/auth/login';

async function testRateLimit() {
  console.log('Starting rate limit test...');
  
  const promises = [];
  for (let i = 0; i < 15; i++) {
    promises.push(
      axios.post(API_URL, {
        email: 'test@example.com',
        password: 'password123'
      }).then(res => ({ status: res.status, index: i }))
        .catch(err => ({ status: err.response?.status || 500, index: i }))
    );
  }

  const results = await Promise.all(promises);
  
  const successCount = results.filter(r => r.status === 200 || r.status === 401).length; // 401 is also "allowed" by rate limit, just invalid creds
  const blockedCount = results.filter(r => r.status === 429).length;

  console.log(`Requests sent: ${results.length}`);
  console.log(`Allowed (200/401): ${successCount}`);
  console.log(`Blocked (429): ${blockedCount}`);

  if (blockedCount > 0) {
    console.log('✅ Rate limiting is WORKING');
  } else {
    console.log('❌ Rate limiting is NOT working (or Redis is down/mocked)');
  }
}

testRateLimit();
