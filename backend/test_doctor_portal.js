import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:5000/api/v1';

async function runDoctorTests() {
  console.log('=== NEURO HARMONY DOCTOR PORTAL INTEGRATION TEST ===\n');

  try {
    // 1. Authenticate Doctor (email/password login)
    console.log('[Test 1] Logging in Doctor via POST /auth/doctor/login...');
    const loginRes = await fetch(`${BASE_URL}/auth/doctor/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'doctor@neuroharmony.in',
        password: 'doctor123'
      })
    });

    const loginData = await loginRes.json();
    console.log('Login response status:', loginRes.status);
    console.log('Login response body:', loginData);

    if (!loginData.success) {
      console.error('Doctor login failed.');
      return;
    }

    const doctorToken = loginData.token;

    // 2. Fetch Doctor's Appointments
    console.log('\n[Test 2] Fetching Doctor appointments list via GET /doctor/appointments...');
    const apptsRes = await fetch(`${BASE_URL}/doctor/appointments`, {
      headers: {
        'Authorization': `Bearer ${doctorToken}`
      }
    });

    const apptsData = await apptsRes.json();
    console.log('Fetch appointments status:', apptsRes.status);
    console.log(`Appointments found: ${apptsData.appointments?.length || 0}`);

    // 3. Create a temporary appointment to update and prescribe
    console.log('\n[Test Setup] Creating a patient booking for testing...');
    const patient = await prisma.user.findFirst({ where: { role: 'PATIENT' } });
    const doctor = await prisma.doctorProfile.findFirst();
    
    // Clean up old slot first
    const existingSlot = await prisma.availabilitySlot.findFirst({
      where: { doctorId: doctor.id, date: new Date(), startTime: '19:00' }
    });
    if (existingSlot) {
      const apptUsingSlot = await prisma.appointment.findFirst({ where: { slotId: existingSlot.id } });
      if (apptUsingSlot) {
        await prisma.prescription.deleteMany({ where: { appointmentId: apptUsingSlot.id } });
        await prisma.payment.deleteMany({ where: { appointmentId: apptUsingSlot.id } });
        await prisma.notification.deleteMany({ where: { userId: patient.id } });
        await prisma.appointment.delete({ where: { id: apptUsingSlot.id } });
      }
      await prisma.availabilitySlot.delete({ where: { id: existingSlot.id } });
    }

    const testSlot = await prisma.availabilitySlot.create({
      data: {
        doctorId: doctor.id,
        date: new Date(),
        startTime: '19:00',
        endTime: '19:30',
        isBooked: false
      }
    });

    const patientToken = jwt.sign(
      { phone: patient.phone, role: 'PATIENT', scope: 'complete_booking' },
      process.env.JWT_ACCESS_SECRET || 'jwt_access_secret_neuro_harmony',
      { expiresIn: '1h' }
    );

    const bookRes = await fetch(`${BASE_URL}/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${patientToken}`
      },
      body: JSON.stringify({
        slotId: testSlot.id,
        patientName: patient.name,
        patientAge: 35,
        patientEmail: patient.email,
        patientPhone: patient.phone,
        symptoms: 'Insomnia testing.'
      })
    });
    const bookData = await bookRes.json();
    console.log('Book response body:', bookData);
    const appointmentId = bookData.appointmentId;
    const bookingId = bookData.bookingId;

    // Flip appointment to scheduled (simulate successful payment)
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'SCHEDULED' }
    });

    // 4. Update status to COMPLETED
    console.log(`\n[Test 3] Marking appointment ${bookingId} COMPLETED via PATCH /doctor/appointments/:id/status...`);
    const statusRes = await fetch(`${BASE_URL}/doctor/appointments/${appointmentId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${doctorToken}`
      },
      body: JSON.stringify({ status: 'COMPLETED' })
    });

    const statusData = await statusRes.json();
    console.log('Status update status:', statusRes.status);
    console.log('Status update body:', statusData);

    // 5. Submit Prescription (generates PDF on-the-fly and stores it)
    console.log(`\n[Test 4] Submitting prescription for appointment ${bookingId} via POST /doctor/appointments/:id/prescription...`);
    const rxRes = await fetch(`${BASE_URL}/doctor/appointments/${appointmentId}/prescription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${doctorToken}`
      },
      body: JSON.stringify({
        diagnosis: 'Insomnia secondary to mild anxiety.',
        advice: 'Practice mindfulness. Walk 30 minutes in the morning. Re-evaluate in 2 weeks.',
        medications: [
          { name: 'Zolpidem 5mg', dosage: '1 tablet', frequency: 'At bedtime' },
          { name: 'Escitalopram 10mg', dosage: '1 tablet', frequency: 'In the morning after food' }
        ]
      })
    });

    const rxData = await rxRes.json();
    console.log('Prescription submission status:', rxRes.status);
    console.log('Prescription response body:', rxData);

    // 6. Verify PDF exists on disk and notification is logged
    console.log('\n[Test 5] Checking PDF storage on local disk and Notification log table...');
    const pdfFilename = `prescription-${bookingId}.pdf`;
    const pdfPath = path.resolve('uploads/prescriptions', pdfFilename);
    const pdfExists = fs.existsSync(pdfPath);
    console.log(`Prescription PDF written to disk: "${pdfExists}" (Path: ${pdfPath})`);

    const notif = await prisma.notification.findFirst({
      where: {
        userId: patient.id,
        message: { contains: bookingId }
      }
    });

    console.log(`Logged notification for patient found in DB: "${!!notif}"`);
    if (notif) {
      console.log(`- Recipient: ${notif.recipient}`);
      console.log(`- Message: "${notif.message}"`);
    }

    if (loginRes.status === 200 && statusData.appointment.status === 'COMPLETED' && pdfExists && notif) {
      console.log('\n=== ALL DOCTOR PORTAL DASHBOARD TESTS PASSED ===');
    } else {
      console.error('\n=== SOME DOCTOR PORTAL TESTS FAILED ===');
    }

  } catch (error) {
    console.error('An error occurred during doctor testing:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runDoctorTests();
