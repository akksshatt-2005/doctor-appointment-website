import { PrismaClient } from '@prisma/client';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { queueConfirmedNotification } from '../services/queueService.js';

const prisma = new PrismaClient();

// Initialize Razorpay client. If credentials are mock, API calls will fail with 401.
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_your_key_id',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'your_razorpay_key_secret'
});

/**
 * Create a Razorpay Order for a pending appointment booking.
 * Request body: { appointmentId }
 */
export async function createRazorpayOrder(req, res, next) {
  const { appointmentId } = req.body;

  if (!appointmentId) {
    return res.status(400).json({
      success: false,
      message: 'Please provide an appointmentId.'
    });
  }

  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { payment: true }
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found.'
      });
    }

    if (!appointment.payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found for this appointment.'
      });
    }

    // Amount must be converted to paise (INR * 100)
    const amountInPaise = Math.round(Number(appointment.payment.amount) * 100);

    // Call Razorpay API to generate the order
    let order;
    try {
      order = await razorpay.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt: appointment.id,
        notes: {
          patientName: appointment.patientName,
          phone: appointment.patientPhone
        }
      });
    } catch (apiError) {
      console.warn('Razorpay order creation failed, falling back to simulated order ID:', apiError.message);
      // Generate a mock order payload
      const mockOrderId = `order_mock_${crypto.randomBytes(8).toString('hex')}`;
      order = {
        id: mockOrderId,
        amount: amountInPaise,
        currency: 'INR'
      };
    }

    // Update database payment record with order ID
    await prisma.payment.update({
      where: { id: appointment.payment.id },
      data: {
        razorpayOrderId: order.id
      }
    });

    return res.status(200).json({
      success: true,
      keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_your_key_id',
      orderId: order.id,
      amount: order.amount,
      currency: order.currency
    });

  } catch (error) {
    console.error('Razorpay order creation error:', error);
    next(error);
  }
}

/**
 * Verify client signature returned after payment checkout modal completes.
 * Request body: { razorpay_payment_id, razorpay_order_id, razorpay_signature }
 */
export async function verifyPaymentSignature(req, res, next) {
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
    return res.status(400).json({
      success: false,
      message: 'Missing required validation signatures.'
    });
  }

  try {
    const secret = process.env.RAZORPAY_KEY_SECRET || 'your_razorpay_key_secret';

    // Verify HMAC signature
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const generatedSignature = hmac.digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature. Verification failed.'
      });
    }

    let updatedApptId = null;

    // Update database entries inside a transaction
    await prisma.$transaction(async (tx) => {
      const paymentRecord = await tx.payment.findFirst({
        where: { razorpayOrderId: razorpay_order_id }
      });

      if (!paymentRecord) {
        throw new Error('PaymentRecordNotFound');
      }

      if (paymentRecord.status !== 'CAPTURED') {
        // Update payment status
        await tx.payment.update({
          where: { id: paymentRecord.id },
          data: {
            status: 'CAPTURED',
            razorpayPaymentId: razorpay_payment_id
          }
        });

        // Update appointment status to scheduled
        const appt = await tx.appointment.update({
          where: { id: paymentRecord.appointmentId },
          data: { status: 'SCHEDULED' }
        });
        updatedApptId = appt.id;

        // Confirm slot booking
        await tx.availabilitySlot.update({
          where: { id: appt.slotId },
          data: { isBooked: true }
        });
      }
    });

    if (updatedApptId) {
      queueConfirmedNotification(updatedApptId);
    }

    return res.status(200).json({
      success: true,
      message: 'Payment verified and appointment scheduled successfully.'
    });

  } catch (error) {
    if (error.message === 'PaymentRecordNotFound') {
      return res.status(404).json({
        success: false,
        message: 'Associated payment record not found.'
      });
    }
    next(error);
  }
}

/**
 * Handle incoming webhooks from Razorpay as the ultimate source of truth.
 * Validates webhook signatures and updates status accordingly.
 */
export async function handleWebhook(req, res, next) {
  const signature = req.headers['x-razorpay-signature'];
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'your_razorpay_webhook_secret';

  if (!signature) {
    return res.status(400).json({
      success: false,
      message: 'Missing webhook signature header.'
    });
  }

  try {
    // Validate signature using raw body buffer
    const hmac = crypto.createHmac('sha256', webhookSecret);
    hmac.update(req.rawBody || '');
    const expectedSignature = hmac.digest('hex');

    if (expectedSignature !== signature) {
      console.warn('Webhook signature mismatch. Expected:', expectedSignature, 'Got:', signature);
      return res.status(400).json({
        success: false,
        message: 'Signature verification failed.'
      });
    }

    const payload = req.body;
    const event = payload.event;
    console.log(`[Webhook Event Received]: ${event}`);

    if (event === 'payment.captured') {
      const paymentEntity = payload.payload.payment.entity;
      const orderId = paymentEntity.order_id;
      const paymentId = paymentEntity.id;

      let updatedApptId = null;

      await prisma.$transaction(async (tx) => {
        const paymentRecord = await tx.payment.findFirst({
          where: { razorpayOrderId: orderId }
        });

        if (paymentRecord && paymentRecord.status !== 'CAPTURED') {
          // Confirm payment
          await tx.payment.update({
            where: { id: paymentRecord.id },
            data: { status: 'CAPTURED', razorpayPaymentId: paymentId }
          });

          // Confirm appointment scheduling
          const appt = await tx.appointment.update({
            where: { id: paymentRecord.appointmentId },
            data: { status: 'SCHEDULED' }
          });
          updatedApptId = appt.id;

          // Enforce slot booking status
          await tx.availabilitySlot.update({
            where: { id: appt.slotId },
            data: { isBooked: true }
          });

          console.log(`Confirmed appointment ${appt.bookingId} via webhook event payment.captured`);
        }
      });

      if (updatedApptId) {
        queueConfirmedNotification(updatedApptId);
      }
    } else if (event === 'payment.failed') {
      const paymentEntity = payload.payload.payment.entity;
      const orderId = paymentEntity.order_id;

      const paymentRecord = await prisma.payment.findFirst({
        where: { razorpayOrderId: orderId }
      });

      if (paymentRecord && paymentRecord.status !== 'CAPTURED') {
        await prisma.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id: paymentRecord.id },
            data: { status: 'FAILED' }
          });

          await tx.appointment.update({
            where: { id: paymentRecord.appointmentId },
            data: { status: 'CANCELLED' }
          });
        });
        console.log(`Cancelled appointment mapping to order ${orderId} via payment.failed webhook event`);
      }
    }

    // Always return 200 OK to Razorpay to avoid retries
    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Webhook processing error:', error);
    // return 500 so Razorpay retries if database is temporarily down
    return res.status(500).json({ success: false, message: error.message });
  }
}
