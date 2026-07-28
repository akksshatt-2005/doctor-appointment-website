import { io as ioClient } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:5000/api/v1';

async function runNotificationTest() {
  console.log('=== NEURO HARMONY NOTIFICATION PIPELINE INTEGRATION TEST ===\n');

  let socket;
  try {
    // 1. Set up Socket.io connection to local server
    console.log('[Test Setup] Connecting Socket.io client to server...');
    socket = ioClient('http://localhost:5000', {
      transports: ['websocket']
    });

    const socketPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Socket.io connection timed out.'));
      }, 5000);

      socket.on('connect', () => {
        console.log(`[Socket] Connected successfully with ID: ${socket.id}`);
        clearTimeout(timeout);
        resolve();
      });
    });

    await socketPromise;

    // Listen for the live 'booking_confirmed' WebSocket event
    let websocketEventReceived = null;
    socket.on('booking_confirmed', (data) => {
      console.log('\n[Socket Event Captured] Received "booking_confirmed" event:');
      console.log(data);
      websocketEventReceived = data;
    });

    // 2. Register / Authenticate patient
    const patient = await prisma.user.findFirst({
      where: { role: 'PATIENT' }
    });
    
    if (!patient) {
      console.error('Database unseeded. Run seeding first.');
      socket.disconnect();
      return;
    }

    const secret = process.env.JWT_ACCESS_SECRET || 'jwt_access_secret_neuro_harmony';
    const patientToken = jwt.sign(
      { phone: patient.phone, role: 'PATIENT', scope: 'complete_booking' },
      secret,
      { expiresIn: '1h' }
    );

    // Create a temporary unbooked slot (clean up old first)
    const doctor = await prisma.doctorProfile.findFirst();
    
    // Clean up any appointments/payments using this slot first
    const existingSlot = await prisma.availabilitySlot.findFirst({
      where: { doctorId: doctor.id, date: new Date(), startTime: '16:00' }
    });
    if (existingSlot) {
      const apptUsingSlot = await prisma.appointment.findFirst({ where: { slotId: existingSlot.id } });
      if (apptUsingSlot) {
        await prisma.payment.deleteMany({ where: { appointmentId: apptUsingSlot.id } });
        await prisma.notification.deleteMany({ where: { userId: patient.id } });
        await prisma.notification.deleteMany({ where: { userId: doctor.userId } });
        await prisma.appointment.delete({ where: { id: apptUsingSlot.id } });
      }
      await prisma.availabilitySlot.delete({ where: { id: existingSlot.id } });
    }

    const testSlot = await prisma.availabilitySlot.create({
      data: {
        doctorId: doctor.id,
        date: new Date(),
        startTime: '16:00',
        endTime: '16:30',
        isBooked: false
      }
    });

    // 3. Create appointment
    console.log(`\n[Test 1] Booking slot ID: ${testSlot.id}...`);
    const bookRes = await fetch(`${BASE_URL}/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${patientToken}`
      },
      body: JSON.stringify({
        slotId: testSlot.id,
        patientName: patient.name,
        patientAge: 32,
        patientEmail: patient.email,
        patientPhone: patient.phone,
        symptoms: 'Anxiety verification testing.'
      })
    });

    const bookData = await bookRes.json();
    const appointmentId = bookData.appointmentId;
    const initialOrderId = bookData.razorpayOrderId;
    console.log(`Reserved appointment ID: ${appointmentId}, Razorpay Order ID: ${initialOrderId}`);

    // 4. Trigger payment.captured Webhook
    console.log('\n[Test 2] Triggering payment.captured Webhook to verify signature and queue notifications...');
    const webhookPayload = {
      entity: 'event',
      account_id: 'acc_dummy123',
      event: 'payment.captured',
      contains: ['payment'],
      payload: {
        payment: {
          entity: {
            id: 'pay_notif_test_456',
            entity: 'payment',
            amount: 70000,
            currency: 'INR',
            status: 'captured',
            order_id: initialOrderId,
            invoice_id: null,
            international: false,
            method: 'card',
            amount_refunded: 0,
            refund_status: null,
            captured: true,
            description: 'Consultation fee',
            card_id: 'card_dummy_456',
            bank: null,
            wallet: null,
            vpa: null,
            email: patient.email,
            contact: patient.phone,
            notes: {},
            fee: 1400,
            tax: 252,
            error_code: null,
            error_description: null,
            created_at: Math.floor(Date.now() / 1000)
          }
        }
      },
      created_at: Math.floor(Date.now() / 1000)
    };

    const webhookBodyStr = JSON.stringify(webhookPayload);
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'your_razorpay_webhook_secret';

    const hmac = crypto.createHmac('sha256', webhookSecret);
    hmac.update(webhookBodyStr);
    const signature = hmac.digest('hex');

    const webhookRes = await fetch(`${BASE_URL}/payments/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': signature
      },
      body: webhookBodyStr
    });

    console.log('Webhook POST status:', webhookRes.status);
    const webhookResData = await webhookRes.json();
    console.log('Webhook POST body response:', webhookResData);

    // 5. Wait for the background queue to complete processing
    console.log('\n[Waiting] Pausing for 5 seconds to let background task queue run...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 6. Verify Database State & Notification logs
    console.log('\n[Test 3] Verifying database records...');
    const appt = await prisma.appointment.findUnique({
      where: { id: appointmentId }
    });
    console.log(`Appointment confirmation status: "${appt.status}"`);

    const loggedNotifs = await prisma.notification.findMany({
      where: {
        message: { contains: appt.bookingId }
      }
    });

    console.log(`Logged notifications in database: ${loggedNotifs.length}`);
    loggedNotifs.forEach(n => {
      console.log(`- [${n.type}] to ${n.recipient}: "${n.message}" (${n.status})`);
    });

    // 7. Verify WebSocket Confirmation Event
    if (websocketEventReceived) {
      console.log('\n[SUCCESS] WebSocket event "booking_confirmed" was received live by the client!');
    } else {
      console.error('\n[FAILED] WebSocket event "booking_confirmed" was NOT received.');
    }

    if (appt.status === 'SCHEDULED' && loggedNotifs.length > 0 && websocketEventReceived) {
      console.log('\n=== ALL NOTIFICATION PIPELINE TESTS PASSED ===');
    } else {
      console.error('\n=== SOME NOTIFICATION TESTS FAILED ===');
    }

  } catch (error) {
    console.error('Error during notification pipeline tests:', error);
  } finally {
    if (socket) socket.disconnect();
    await prisma.$disconnect();
  }
}

runNotificationTest();
