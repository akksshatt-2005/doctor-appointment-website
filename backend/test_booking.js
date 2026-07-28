import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:5000/api/v1';

async function runTests() {
  console.log('=== NEURO HARMONY AVAILABILITY & BOOKING FLOW TEST ===\n');

  try {
    // 1. Retrieve Doctor and Patient users from database to generate mock JWTs
    const doctor = await prisma.user.findFirst({
      where: { role: 'DOCTOR' },
      include: { doctorProfile: true }
    });

    const patient = await prisma.user.findFirst({
      where: { role: 'PATIENT' }
    });

    if (!doctor || !patient) {
      console.error('Failed to retrieve seed data. Ensure database is seeded. Exiting.');
      return;
    }

    const secret = process.env.JWT_ACCESS_SECRET || 'jwt_access_secret_neuro_harmony';
    
    // Generate valid tokens
    const doctorToken = jwt.sign({ id: doctor.id, role: 'DOCTOR' }, secret, { expiresIn: '1h' });
    const patientToken = jwt.sign({ phone: patient.phone, role: 'PATIENT', scope: 'complete_booking' }, secret, { expiresIn: '1h' });

    console.log(`Doctor ID: ${doctor.doctorProfile.id}`);
    console.log(`Patient Phone: ${patient.phone}`);

    // 2. Configure Availability Templates for the doctor (Test: POST /api/v1/doctors/templates)
    console.log('\n[Test 1] Configuring weekly templates for Doctor...');
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 (Sunday) to 6 (Saturday)

    const templatesPayload = {
      templates: [
        { dayOfWeek: dayOfWeek, startTime: '17:00', endTime: '18:00', consultType: 'ONLINE' }, // Today, Online slots
        { dayOfWeek: (dayOfWeek + 1) % 7, startTime: '11:00', endTime: '12:00', consultType: 'CLINIC' } // Tomorrow, Clinic slots
      ]
    };

    const templateRes = await fetch(`${BASE_URL}/doctors/templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${doctorToken}`
      },
      body: JSON.stringify(templatesPayload)
    });

    const templateData = await templateRes.json();
    console.log('Templates API Response:', templateRes.status, templateData);

    // 3. Generate Concrete Slots (Test: POST /api/v1/doctors/slots/generate)
    console.log('\n[Test 2] Generating concrete slots for the next 14 days...');
    const generateRes = await fetch(`${BASE_URL}/doctors/slots/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${doctorToken}`
      }
    });

    const generateData = await generateRes.json();
    console.log('Generate API Response:', generateRes.status, generateData);

    // 4. Fetch Doctor Availability (Test: GET /api/v1/doctors/:id/availability)
    // Get formatted date for today: YYYY-MM-DD
    const pad = (num) => String(num).padStart(2, '0');
    const dateStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    
    console.log(`\n[Test 3] Fetching availability for date ${dateStr}...`);
    const availRes = await fetch(`${BASE_URL}/doctors/${doctor.doctorProfile.id}/availability?date=${dateStr}`);
    const availData = await availRes.json();
    console.log('Availability API Response:', availRes.status);
    console.log('Available slots found:', availData.slots.length);
    if (availData.slots.length > 0) {
      console.log('First available slot:', availData.slots[0]);
    } else {
      console.error('No slots available for today. Exiting.');
      return;
    }

    const testSlot = availData.slots[0];

    // 5. Book Slot (Test 4: POST /api/v1/appointments/book)
    console.log(`\n[Test 4] Booking slot ID: ${testSlot.id} for patient: ${patient.name}...`);
    const bookPayload = {
      slotId: testSlot.id,
      patientName: patient.name,
      patientAge: 25,
      patientEmail: patient.email,
      patientPhone: patient.phone,
      symptoms: 'Experiencing workplace anxiety and mild headaches.'
    };

    const bookRes = await fetch(`${BASE_URL}/appointments/book`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${patientToken}`
      },
      body: JSON.stringify(bookPayload)
    });

    const bookData = await bookRes.json();
    console.log('Book API Response:', bookRes.status, bookData);

    // 6. Fetch Availability Again (Test 5: Verify slot is no longer returned)
    console.log('\n[Test 5] Fetching availability again to verify booked slot is removed...');
    const availRes2 = await fetch(`${BASE_URL}/doctors/${doctor.doctorProfile.id}/availability?date=${dateStr}`);
    const availData2 = await availRes2.json();
    
    const isSlotStillAvailable = availData2.slots.some(s => s.id === testSlot.id);
    if (!isSlotStillAvailable) {
      console.log('[SUCCESS] Booked slot has been removed from public availability listings!');
    } else {
      console.error('[FAILED] Booked slot is still listed as available.');
    }

    // 7. Double-Booking Prevention (Test 6: Booking same slot again should fail)
    console.log('\n[Test 6] Attempting to book the same slot again (should fail)...');
    const doubleBookRes = await fetch(`${BASE_URL}/appointments/book`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${patientToken}`
      },
      body: JSON.stringify(bookPayload)
    });

    const doubleBookData = await doubleBookRes.json();
    console.log('Double Book Response Status:', doubleBookRes.status);
    console.log('Double Book Response Body:', doubleBookData);

    if (doubleBookRes.status === 400 && doubleBookData.success === false) {
      console.log('[SUCCESS] Double-booking blocked cleanly by atomic database transaction!');
    } else {
      console.error('[FAILED] Double-booking check was not enforced.');
    }

  } catch (error) {
    console.error('An error occurred during test execution:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
