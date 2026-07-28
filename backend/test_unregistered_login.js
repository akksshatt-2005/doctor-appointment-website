import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:5000/api/v1/auth';

async function runUnregisteredLoginTest() {
  console.log('=== NEURO HARMONY UNREGISTERED USER SIGNUP/LOGIN TEST ===\n');

  const testPhone = '9012345678';
  const testName = 'Meera Walkthrough';

  try {
    // 1. Clean up old user record if it exists from a previous run
    const existingUser = await prisma.user.findUnique({ where: { phone: testPhone } });
    if (existingUser) {
      await prisma.feedback.deleteMany({ where: { patientId: existingUser.id } });
      await prisma.appointment.deleteMany({ where: { patientId: existingUser.id } });
      await prisma.notification.deleteMany({ where: { userId: existingUser.id } });
      await prisma.user.delete({ where: { id: existingUser.id } });
      console.log(`Cleaned up old test user: ${testPhone}`);
    }

    // 2. Request OTP Code
    console.log(`[Test 1] Requesting OTP for unregistered phone: ${testPhone}...`);
    const sendRes = await fetch(`${BASE_URL}/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: testPhone })
    });
    const sendData = await sendRes.json();
    console.log('Send OTP response:', sendData);

    // Parse OTP from sms_log.txt
    const logPath = path.resolve('sms_log.txt');
    if (!fs.existsSync(logPath)) {
      console.error('sms_log.txt does not exist.');
      return;
    }
    const logs = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    const relevantLog = logs.reverse().find(line => line.includes(testPhone) && line.includes('OTP is'));
    if (!relevantLog) {
      console.error('OTP log line not found in sms_log.txt.');
      return;
    }
    const logMatch = relevantLog.match(/OTP is (\d{6})/);
    if (!logMatch) {
      console.error('Failed to parse OTP from log line.');
      return;
    }
    const code = logMatch[1];
    console.log(`Retrieved OTP Code from log: ${code}`);

    // 3. Verify OTP without name (Simulates logging in directly with unregistered number)
    console.log(`\n[Test 2] Verifying OTP: ${code} without providing name...`);
    const verifyRes = await fetch(`${BASE_URL}/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: testPhone, code })
    });
    const verifyData = await verifyRes.json();
    console.log('Verify OTP status:', verifyRes.status);
    console.log('Verify OTP response body:', verifyData);

    if (verifyData.success && verifyData.userExists === false && verifyData.registrationToken) {
      console.log('\n[SUCCESS] Server correctly identified unregistered number and issued registrationToken.');
    } else {
      console.error('Failed: Server did not return registrationToken.');
      return;
    }

    const regToken = verifyData.registrationToken;

    // 4. Submit Name and registrationToken to complete profile creation
    console.log(`\n[Test 3] Submitting name "${testName}" to complete registration via POST /register...`);
    const registerRes = await fetch(`${BASE_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: testName,
        registrationToken: regToken
      })
    });
    const registerData = await registerRes.json();
    console.log('Register status:', registerRes.status);
    console.log('Register response body:', registerData);

    // 5. Verify database record
    console.log('\n[Test 4] Verifying database records...');
    const dbUser = await prisma.user.findUnique({ where: { phone: testPhone } });
    console.log(`User created in PostgreSQL User table: "${!!dbUser}"`);
    if (dbUser) {
      console.log(`- Created Name: ${dbUser.name}`);
      console.log(`- Created Phone: ${dbUser.phone}`);
      console.log(`- Role: ${dbUser.role}`);
    }

    if (registerData.success && registerData.token && dbUser && dbUser.name === testName) {
      console.log('\n=== ALL UNREGISTERED LOGIN/SIGNUP TESTS PASSED ===');
    } else {
      console.error('\n=== LOGIN/SIGNUP TEST FAILED ===');
    }

  } catch (err) {
    console.error('Error running test:', err);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

runUnregisteredLoginTest();
