import readline from 'readline';

const BASE_URL = 'http://localhost:5000/api/v1/auth';
const TEST_PHONE = '9999999999';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function runTests() {
  console.log('=== NEURO HARMONY OTP FLOW INTEGRATION TEST ===\n');

  try {
    // 1. Test sending OTP
    console.log(`[Test 1] Requesting OTP for phone: ${TEST_PHONE}...`);
    const sendResponse = await fetch(`${BASE_URL}/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: TEST_PHONE })
    });
    
    const sendData = await sendResponse.json();
    console.log('Response Status:', sendResponse.status);
    console.log('Response Body:', sendData);
    
    if (!sendData.success) {
      console.error('Failed to send OTP. Exiting test.');
      rl.close();
      return;
    }
    
    console.log('\n--> Please check the backend server terminal console logs for the printed 6-digit OTP code.');
    const code = await question('Enter the 6-digit OTP code here: ');

    // 2. Test verifying OTP
    console.log(`\n[Test 2] Verifying OTP: ${code} for phone: ${TEST_PHONE}...`);
    const verifyResponse = await fetch(`${BASE_URL}/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: TEST_PHONE, code })
    });
    
    const verifyData = await verifyResponse.json();
    console.log('Response Status:', verifyResponse.status);
    console.log('Response Body:', verifyData);

    if (verifyData.success) {
      console.log('\n[SUCCESS] Auth token generated successfully!');
      console.log('Token:', verifyData.token);
    } else {
      console.log('\n[FAILED] Verification failed.');
    }

    // 3. Test Rate Limiting
    console.log('\n[Test 3] Testing Send OTP Rate Limit (hitting send multiple times)...');
    for (let i = 1; i <= 5; i++) {
      console.log(`Send attempt ${i + 1}/5 (limit check)...`);
      const r = await fetch(`${BASE_URL}/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: TEST_PHONE })
      });
      const d = await r.json();
      console.log(`Status: ${r.status}, Success: ${d.success}, Message: ${d.message}`);
      if (!d.success && r.status === 429) {
        console.log('\n[SUCCESS] Send Rate limiting triggered correctly at attempt ' + (i + 1));
        break;
      }
    }

  } catch (error) {
    console.error('An error occurred during test execution:', error);
  } finally {
    rl.close();
  }
}

runTests();
