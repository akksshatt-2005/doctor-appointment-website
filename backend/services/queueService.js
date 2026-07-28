import { PrismaClient } from '@prisma/client';
import { notifyAppointmentBooking, sendEmail } from './notificationService.js';

const prisma = new PrismaClient();

class InProcessQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
  }

  enqueue(task) {
    this.queue.push(task);
    this.processNext();
  }

  async processNext() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;
    
    const task = this.queue.shift();
    try {
      await task();
    } catch (err) {
      console.error('[Queue Task Error] Task failed:', err);
    } finally {
      this.isProcessing = false;
      this.processNext();
    }
  }
}

const notificationQueue = new InProcessQueue();

/**
 * Queue a background job to send email/SMS confirmation and emit WebSocket updates.
 * @param {string} appointmentId 
 */
export function queueConfirmedNotification(appointmentId) {
  notificationQueue.enqueue(async () => {
    try {
      console.log(`[Queue] Processing booking confirmation notifications for appointment ID: ${appointmentId}`);
      
      const appt = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: {
          doctor: {
            include: { user: true }
          }
        }
      });
      
      if (!appt) {
        console.error(`[Queue] Appointment not found for ID: ${appointmentId}`);
        return;
      }

      // 1. Send patient email, patient SMS, and doctor mock email
      await notifyAppointmentBooking(appt);

      // 2. Log notifications in database
      await prisma.notification.createMany({
        data: [
          {
            userId: appt.patientId,
            type: 'EMAIL',
            recipient: appt.patientEmail,
            message: `Confirmed booking ID: ${appt.bookingId} on ${appt.appointmentDate.toDateString()} at ${appt.slotTime}`,
            status: 'SENT'
          },
          {
            userId: appt.patientId,
            type: 'SMS',
            recipient: appt.patientPhone,
            message: `Consultation confirmed. ID: ${appt.bookingId}`,
            status: 'SENT'
          },
          {
            userId: appt.doctor.userId,
            type: 'EMAIL',
            recipient: appt.doctor?.user?.email || 'doctor-notifications@neuroharmony.in',
            message: `New appointment notification for booking ID: ${appt.bookingId}`,
            status: 'SENT'
          }
        ]
      });

      // 3. Emit real-time WebSocket event to active Doctor Portal connections
      const { io: socketIo } = await import('../server.js');
      if (socketIo) {
        socketIo.emit('booking_confirmed', {
          bookingId: appt.bookingId,
          patientName: appt.patientName,
          slotTime: appt.slotTime,
          date: appt.appointmentDate.toDateString(),
          symptoms: appt.symptoms
        });
        console.log(`[Queue] Emitted booking_confirmed live event for doctor dashboard.`);
      }

    } catch (error) {
      console.error(`[Queue Error] Notification processing failed:`, error);
    }
  });
}
