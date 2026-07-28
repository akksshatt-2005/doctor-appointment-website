import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:5000/api/v1';

async function runTests() {
  console.log('=== NEURO HARMONY RAZORPAY INTEGRATION & WEBHOOK TEST ===\n');

  try {
    // 1. Prepare patient auth token
    const patient = await prisma.user.findFirst({
      where: { role: 'PATIENT' }
    });

    if (!patient) {
      console.error('Patient data missing. Please seed the database first.');
      return;
    }

    const secret = process.env.JWT_ACCESS_SECRET || 'jwt_access_secret_neuro_harmony';
    const patientToken = jwt.sign(
      { phone: patient.phone, role: 'PATIENT', scope: 'complete_booking' },
      secret,
      { expiresIn: '1h' }
    );

    // Create an unbooked slot to book
    const doctor = await prisma.doctorProfile.findFirst();
    const testSlot = await prisma.availabilitySlot.create({
      data: {
        doctorId: doctor.id,
        date: new Date(),
        startTime: '14:00',
        endTime: '14:30',
        isBooked: false
      }
    });

    // 2. Book appointment (returns PENDING_PAYMENT)
    console.log(`[Test 1] Booking slot ID: ${testSlot.id} (should create pending payment)...`);
    const bookRes = await fetch(`${BASE_URL}/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${patientToken}`
      },
      body: JSON.stringify({
        slotId: testSlot.id,
        patientName: patient.name,
        patientAge: 30,
        patientEmail: patient.email,
        patientPhone: patient.phone,
        symptoms: 'Mild stress.'
      })
    });

    const bookData = await bookRes.json();
    console.log('Booking response:', bookRes.status, bookData);

    const appointmentId = bookData.appointmentId;
    const initialOrderId = bookData.razorpayOrderId;

    // Verify database initial state
    let appt = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { payment: true }
    });
    console.log(`Initial Appointment Status in DB: "${appt.status}"`);
    console.log(`Initial Payment Status in DB: "${appt.payment.status}"`);

    // 3. Simulate Webhook Trigger (payment.captured)
    console.log('\n[Test 2] Constructing and sending signed payment.captured webhook payload...');
    
    // Standard Razorpay webhook payload format
    const webhookPayload = {
      entity: 'event',
      account_id: 'acc_dummy123',
      event: 'payment.captured',
      contains: ['payment'],
      payload: {
        payment: {
          entity: {
            id: 'pay_test_payment_123',
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
            description: 'Telehealth consultation fee',
            card_id: 'card_dummy_123',
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

    // Calculate signature
    const hmac = crypto.createHmac('sha256', webhookSecret);
    hmac.update(webhookBodyStr);
    const signature = hmac.digest('hex');

    // Trigger webhook POST request
    const webhookRes = await fetch(`${BASE_URL}/payments/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': signature
      },
      body: webhookBodyStr
    });

    console.log('Webhook response status:', webhookRes.status);
    const webhookData = await webhookRes.json();
    console.log('Webhook response body:', webhookData);

    // 4. Verify database state after webhook fires
    console.log('\n[Test 3] Verifying database changes after webhook processing...');
    appt = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { payment: true }
    });

    console.log(`Updated Appointment Status in DB: "${appt.status}"`);
    console.log(`Updated Payment Status in DB: "${appt.payment.status}"`);

    const slot = await prisma.availabilitySlot.findUnique({
      where: { id: appt.slotId }
    });
    console.log(`Availability Slot isBooked Status: "${slot.isBooked}"`);

    if (appt.status === 'SCHEDULED' && appt.payment.status === 'CAPTURED' && slot.isBooked === true) {
      console.log('\n[SUCCESS] Webhook event successfully parsed, signature verified, and booking transitioned to scheduled!');
    } else {
      console.error('\n[FAILED] Database states were not successfully transitioned by webhook handler.');
    }

  } catch (error) {
    console.error('An error occurred during test execution:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
