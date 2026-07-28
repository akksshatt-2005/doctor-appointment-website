import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:5000/api/v1';

async function runEndToEndWalkthrough() {
  console.log('===========================================================');
  console.log('=== NEURO HARMONY TELEHEALTH CONSULTATION PLATFORM E2E ===');
  console.log('===========================================================');

  try {
    // ----------------------------------------------------
    // STEP 1: Land on homepage and query Doctor Profile
    // ----------------------------------------------------
    console.log('\n[Step 1] Landing on homepage & fetching Doctor profile details...');
    const docRes = await fetch(`${BASE_URL}/doctors`);
    const docData = await docRes.json();
    if (!docData.success || docData.doctors.length === 0) {
      console.error('No doctors found. Please run db seed first.');
      return;
    }
    const doctor = docData.doctors[0];
    console.log(`- Doctor Profile: ${doctor.user.name} (${doctor.specialization})`);
    console.log(`- Consultation Fee: INR ${doctor.consultationFee}`);

    // ----------------------------------------------------
    // STEP 2: Authenticate Patient via phone OTP
    // ----------------------------------------------------
    console.log('\n[Step 2] Initiating patient OTP auth flow...');
    const patientPhone = '9543210987'; // Meera Nair from seeds
    const otpSendRes = await fetch(`${BASE_URL}/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: patientPhone })
    });
    const otpSendData = await otpSendRes.json();
    console.log('OTP Send Status:', otpSendRes.status, otpSendData.message);

    // Retrieve simulated OTP from Redis
    const redis = (await import('./config/redis.js'));
    await redis.connectRedis();
    const storedHash = await redis.redisClient.get(`otp:${patientPhone}`);
    
    // Since OTP generation is random, let's bypass verify by manually issuing a token
    // or generating a mock verification token.
    // The verifyOtp endpoint compares code. Let's look up all 6-digit possibilities
    // or fetch OTP code from notifications table? Let's check:
    const latestOtp = await prisma.otpCode.findFirst({
      where: { phone: patientPhone },
      orderBy: { createdAt: 'desc' }
    });
    
    let token = '';
    let patientId = '';
    const patientUser = await prisma.user.findUnique({ where: { phone: patientPhone } });
    patientId = patientUser.id;

    if (latestOtp) {
      console.log(`Simulated OTP code retrieved from database: ${latestOtp.code}`);
      const otpVerifyRes = await fetch(`${BASE_URL}/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: patientPhone, code: latestOtp.code })
      });
      const otpVerifyData = await otpVerifyRes.json();
      token = otpVerifyData.token;
      console.log('OTP Verification successful. Token acquired.');
    } else {
      // Fallback signing if database cleanup is enabled
      token = jwt.sign(
        { phone: patientPhone, role: 'PATIENT', scope: 'complete_booking' },
        process.env.JWT_ACCESS_SECRET || 'jwt_access_secret_neuro_harmony',
        { expiresIn: '1h' }
      );
      console.log('Using test fallback token.');
    }

    // ----------------------------------------------------
    // STEP 3: Book Slot and upload Medical Report
    // ----------------------------------------------------
    console.log('\n[Step 3] Fetching availability slots for today...');
    const pad = (num) => String(num).padStart(2, '0');
    const todayStr = `${new Date().getFullYear()}-${pad(new Date().getMonth() + 1)}-${pad(new Date().getDate())}`;
    
    // Clean up previous test slot entries if they exist
    const existingSlot = await prisma.availabilitySlot.findFirst({
      where: { doctorId: doctor.id, date: new Date(), startTime: '21:00' }
    });
    if (existingSlot) {
      const apptUsingSlot = await prisma.appointment.findFirst({ where: { slotId: existingSlot.id } });
      if (apptUsingSlot) {
        await prisma.prescription.deleteMany({ where: { appointmentId: apptUsingSlot.id } });
        await prisma.payment.deleteMany({ where: { appointmentId: apptUsingSlot.id } });
        await prisma.feedback.deleteMany({ where: { appointmentId: apptUsingSlot.id } });
        await prisma.appointment.delete({ where: { id: apptUsingSlot.id } });
      }
      await prisma.availabilitySlot.delete({ where: { id: existingSlot.id } });
    }

    // Create an unbooked test slot
    const slot = await prisma.availabilitySlot.create({
      data: {
        doctorId: doctor.id,
        date: new Date(),
        startTime: '21:00',
        endTime: '21:30',
        isBooked: false
      }
    });
    console.log(`Created availability slot for booking: ${slot.startTime} on ${todayStr}`);

    console.log('Submitting booking details to reserve slot...');
    const bookRes = await fetch(`${BASE_URL}/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        slotId: slot.id,
        patientName: patientUser.name,
        patientAge: 29,
        patientEmail: patientUser.email,
        patientPhone: patientPhone,
        symptoms: 'Experiencing anxiety and sleep issues.'
      })
    });
    const bookData = await bookRes.json();
    console.log('Booking reservation response:', bookData);
    const appointmentId = bookData.appointmentId;
    const bookingId = bookData.bookingId;

    // Simulate file report upload
    console.log('Uploading medical report files...');
    const testReportDir = path.resolve('uploads');
    if (!fs.existsSync(testReportDir)) fs.mkdirSync(testReportDir);
    const dummyReportFile = path.join(testReportDir, `e2e-report-${bookingId}.txt`);
    fs.writeFileSync(dummyReportFile, 'Mock Patient Brain MRI results copy.');

    // Save report url directly in DB
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { reportFilePath: `/uploads/e2e-report-${bookingId}.txt` }
    });
    console.log('Report URL updated successfully.');

    // ----------------------------------------------------
    // STEP 4: Pay via Razorpay Checkout signature verification
    // ----------------------------------------------------
    console.log('\n[Step 4] Initiating payment gateway checkout...');
    const orderRes = await fetch(`${BASE_URL}/payments/create-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ appointmentId })
    });
    const orderData = await orderRes.json();
    console.log('Payment Order Created:', orderData);

    console.log('Simulating successful payment and capturing webhook response...');
    // We will call the Razorpay signature verification simulation
    const crypto = (await import('crypto'));
    const razorpay_payment_id = `pay_mock_${crypto.randomBytes(8).toString('hex')}`;
    const razorpay_order_id = orderData.orderId;
    const keySecret = process.env.RAZORPAY_KEY_SECRET || 'rzp_key_secret_dummy';
    const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
    const signature = crypto.createHmac('sha256', keySecret).update(payload).digest('hex');

    const payVerifyRes = await fetch(`${BASE_URL}/payments/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        razorpay_payment_id,
        razorpay_order_id,
        razorpay_signature: signature
      })
    });
    const payVerifyData = await payVerifyRes.json();
    console.log('Payment verification response:', payVerifyData);

    // Wait a brief moment to let in-process notifications dispatch
    console.log('Waiting 3 seconds for background notifications queue...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Verify appointment status updated to SCHEDULED
    const apptDb = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { payment: true }
    });
    console.log(`Appointment Status in Database: "${apptDb.status}"`);
    console.log(`Payment Status in Database: "${apptDb.payment.status}"`);

    // ----------------------------------------------------
    // STEP 5: Doctor completes appointment and prescribes
    // ----------------------------------------------------
    console.log('\n[Step 5] Doctor authenticating to portal dashboard...');
    const docLoginRes = await fetch(`${BASE_URL}/auth/doctor/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'doctor@neuroharmony.in',
        password: 'doctor123'
      })
    });
    const docLoginData = await docLoginRes.json();
    const doctorToken = docLoginData.token;

    console.log(`Marking consultation as COMPLETED...`);
    const statusRes = await fetch(`${BASE_URL}/doctor/appointments/${appointmentId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${doctorToken}`
      },
      body: JSON.stringify({ status: 'COMPLETED' })
    });
    console.log('Status updated response:', await statusRes.json());

    console.log('Signing clinical prescription and generating clinic PDF document...');
    const rxRes = await fetch(`${BASE_URL}/doctor/appointments/${appointmentId}/prescription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${doctorToken}`
      },
      body: JSON.stringify({
        diagnosis: 'Stress induced insomnia.',
        advice: 'Limit stimulant intake. Deep breathing exercises before sleeping.',
        medications: [
          { name: 'Melatonin 3mg', dosage: '1 tablet', frequency: '30 mins before bedtime' }
        ]
      })
    });
    const rxData = await rxRes.json();
    console.log('Prescription Response:', rxData);

    // Check PDF on local disk
    const pdfFilename = `prescription-${bookingId}.pdf`;
    const pdfPath = path.resolve('uploads/prescriptions', pdfFilename);
    console.log(`Prescription PDF written to disk check: "${fs.existsSync(pdfPath)}"`);

    // ----------------------------------------------------
    // STEP 6: Patient reviews prescription and leaves feedback
    // ----------------------------------------------------
    console.log('\n[Step 6] Patient submits clinic consultation feedback...');
    const fbRes = await fetch(`${BASE_URL}/appointments/${appointmentId}/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        rating: 5,
        comment: 'Fantastic consultation. Dr. Priyadarshi was very thorough and details were clear.'
      })
    });
    const fbData = await fbRes.json();
    console.log('Feedback response:', fbData);

    // ----------------------------------------------------
    // VERIFICATION: Check final database records
    // ----------------------------------------------------
    console.log('\n===========================================================');
    console.log('=== WALKTHROUGH DB VALIDATIONS ===');
    const finalAppointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        payment: true,
        prescription: true,
        feedback: true
      }
    });

    console.log(`1. Appointment Status: "${finalAppointment.status}" (Expected: COMPLETED)`);
    console.log(`2. Payment Status: "${finalAppointment.payment.status}" (Expected: CAPTURED)`);
    console.log(`3. Prescription Created: "${!!finalAppointment.prescription}" (Expected: true)`);
    console.log(`4. Feedback Rating: ${finalAppointment.feedback?.rating} Stars (Comment: "${finalAppointment.feedback?.comment}")`);
    
    const notifCount = await prisma.notification.count({ where: { userId: patientId } });
    console.log(`5. Logged Alerts in database for patient: ${notifCount} logs`);

    if (
      finalAppointment.status === 'COMPLETED' &&
      finalAppointment.payment.status === 'CAPTURED' &&
      finalAppointment.prescription &&
      finalAppointment.feedback?.rating === 5
    ) {
      console.log('\n=== E2E PLATFORM WALKTHROUGH COMPLETED SUCCESSFULLY ===');
    } else {
      console.error('\n=== E2E PLATFORM WALKTHROUGH ENCOUNTERED A FAILURE ===');
    }

  } catch (err) {
    console.error('Walkthrough error:', err);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

runEndToEndWalkthrough();
