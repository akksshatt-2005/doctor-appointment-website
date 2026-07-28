import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:5000/api/v1';

async function runTests() {
  console.log('=== NEURO HARMONY REPORT UPLOAD & FLOW TEST ===\n');

  try {
    // 1. Prepare patient authentication token
    const patient = await prisma.user.findFirst({
      where: { role: 'PATIENT' }
    });

    if (!patient) {
      console.error('Patient seed data missing. Run seed script first.');
      return;
    }

    const secret = process.env.JWT_ACCESS_SECRET || 'jwt_access_secret_neuro_harmony';
    const patientToken = jwt.sign(
      { phone: patient.phone, role: 'PATIENT', scope: 'complete_booking' },
      secret,
      { expiresIn: '1h' }
    );

    // Create an unbooked slot to test with
    const doctor = await prisma.doctorProfile.findFirst();
    const testSlot = await prisma.availabilitySlot.create({
      data: {
        doctorId: doctor.id,
        date: new Date(),
        startTime: '13:00',
        endTime: '13:30',
        isBooked: false
      }
    });

    console.log(`Reserved Slot ID for booking: ${testSlot.id}`);

    // 2. Book appointment (POST /api/v1/appointments)
    console.log('\n[Test 1] Booking appointment...');
    const bookPayload = {
      slotId: testSlot.id,
      patientName: patient.name,
      patientAge: 25,
      patientEmail: patient.email,
      patientPhone: patient.phone,
      symptoms: 'Anxiety and trouble sleeping.'
    };

    const bookRes = await fetch(`${BASE_URL}/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${patientToken}`
      },
      body: JSON.stringify(bookPayload)
    });

    const bookData = await bookRes.json();
    console.log('Book Response Status:', bookRes.status);
    console.log('Book Response Body:', bookData);

    if (!bookData.success) {
      console.error('Booking failed. Exiting test.');
      return;
    }

    const appointmentId = bookData.appointmentId;

    // 3. Upload report (POST /api/v1/appointments/:id/upload-report)
    console.log(`\n[Test 2] Uploading report for appointment ID: ${appointmentId}...`);
    
    // Create mock PDF content in memory
    const mockFileContent = '%PDF-1.4 Mock PDF Content for Neuropsychiatric Report';
    const blob = new Blob([mockFileContent], { type: 'application/pdf' });
    
    const formData = new FormData();
    formData.append('report', blob, 'my_mri_report.pdf');

    const uploadRes = await fetch(`${BASE_URL}/appointments/${appointmentId}/upload-report`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${patientToken}`
      },
      body: formData
    });

    const uploadData = await uploadRes.json();
    console.log('Upload Response Status:', uploadRes.status);
    console.log('Upload Response Body:', uploadData);

    if (uploadRes.status === 200 && uploadData.success) {
      console.log('[SUCCESS] Report uploaded successfully and local path saved!');
      console.log('Report URL:', uploadData.reportFilePath);
    } else {
      console.error('[FAILED] Report upload failed.');
    }

    // 4. Fetch details (GET /api/v1/appointments/:id) - Ownership check
    console.log('\n[Test 3] Fetching appointment status with patient token (should succeed)...');
    const getResCorrect = await fetch(`${BASE_URL}/appointments/${appointmentId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${patientToken}`
      }
    });

    const getDataCorrect = await getResCorrect.json();
    console.log('Fetch (Correct Token) Status:', getResCorrect.status);
    console.log('Report File Path returned:', getDataCorrect.appointment.reportFilePath);

    if (getResCorrect.status === 200 && getDataCorrect.success) {
      console.log('[SUCCESS] Access granted. Patient fetched their own appointment status.');
    } else {
      console.error('[FAILED] Access denied for owner.');
    }

    // 5. Fetch details with wrong token (GET /api/v1/appointments/:id) - Security check
    console.log('\n[Test 4] Fetching appointment status with incorrect patient token (should fail)...');
    const wrongToken = jwt.sign(
      { phone: '8888888888', role: 'PATIENT', scope: 'complete_booking' },
      secret,
      { expiresIn: '1h' }
    );

    const getResWrong = await fetch(`${BASE_URL}/appointments/${appointmentId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${wrongToken}`
      }
    });

    const getDataWrong = await getResWrong.json();
    console.log('Fetch (Wrong Token) Status:', getResWrong.status);
    console.log('Fetch (Wrong Token) Body:', getDataWrong);

    if (getResWrong.status === 403) {
      console.log('[SUCCESS] Access denied. Patients are blocked from reading other patients\' appointments!');
    } else {
      console.error('[FAILED] Security hole! Access was not blocked.');
    }

  } catch (error) {
    console.error('An error occurred during test execution:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
