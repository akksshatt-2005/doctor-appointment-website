import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { sendEmail, sendSms } from './notificationService.js';

const prisma = new PrismaClient();

function parseSlotTimeToMinutes(slotTimeStr) {
  // Parses e.g. "05:30 PM"
  const parts = slotTimeStr.split(' ');
  if (parts.length < 2) return 0;
  const [time, ampm] = parts;
  let [hours, minutes] = time.split(':').map(Number);
  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

export function startReminderScheduler() {
  // Runs every minute
  cron.schedule('* * * * *', async () => {
    console.log('[Scheduler] Checking for upcoming consultations to send 1-hour reminders...');

    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const dayVal = now.getDate();
      const today = new Date(Date.UTC(year, month, dayVal, 0, 0, 0, 0));

      // Fetch all scheduled appointments for today
      const appointments = await prisma.appointment.findMany({
        where: {
          appointmentDate: today,
          status: 'SCHEDULED'
        },
        include: {
          doctor: {
            include: { user: true }
          }
        }
      });

      const currentMinutesFromMidnight = now.getHours() * 60 + now.getMinutes();
      const targetTimeInMinutes = currentMinutesFromMidnight + 60; // 1 hour from now

      for (const appt of appointments) {
        const slotMinutes = parseSlotTimeToMinutes(appt.slotTime);

        // Match appointments that fall within +/- 5 minutes of 1 hour from now
        const isTimeMatch = Math.abs(slotMinutes - targetTimeInMinutes) <= 5;

        if (isTimeMatch) {
          // Verify we haven't already sent a reminder to this user for this booking ID
          const alreadySent = await prisma.notification.findFirst({
            where: {
              userId: appt.patientId,
              AND: [
                { message: { contains: '1-hour reminder' } },
                { message: { contains: appt.bookingId } }
              ]
            }
          });

          if (alreadySent) {
            console.log(`[Scheduler] Reminder already sent for appointment ${appt.bookingId}. Skipping.`);
            continue;
          }

          console.log(`[Scheduler] Sending 1-hour reminders for appointment ${appt.bookingId} starting at ${appt.slotTime}`);

          // 1. Notify Patient via Email
          await sendEmail({
            to: appt.patientEmail,
            subject: `Reminder: Consultation starting in 1 hour - ${appt.bookingId}`,
            text: `Dear ${appt.patientName},\n\nThis is a reminder that your online video consultation with Dr. Priyadarshi Srivastava starts in 1 hour (at ${appt.slotTime}).\nJoin Room: ${appt.videoRoomId}\n\nNeuro Harmony Team`,
            html: `
              <h3>Consultation Reminder</h3>
              <p>Dear ${appt.patientName},</p>
              <p>Your online video consultation starts in 1 hour.</p>
              <ul>
                <li><strong>Doctor:</strong> Dr. Priyadarshi Srivastava</li>
                <li><strong>Time:</strong> ${appt.slotTime}</li>
                <li><strong>Video Room ID:</strong> ${appt.videoRoomId}</li>
              </ul>
              <p>You can join the room directly from your patient portal dashboard when it begins.</p>
            `
          });

          // 2. Notify Patient via SMS/WhatsApp
          await sendSms(
            appt.patientPhone,
            `Your consultation with Dr. Priyadarshi starts in 1 hour (at ${appt.slotTime}). Booking ID: ${appt.bookingId}`
          );

          // 3. Notify Doctor via Email
          await sendEmail({
            to: appt.doctor?.user?.email || 'doctor-notifications@neuroharmony.in',
            subject: `Reminder: Consultation with ${appt.patientName} starts in 1 hour`,
            text: `Dear Dr. Priyadarshi Srivastava,\n\nYour consultation with ${appt.patientName} starts in 1 hour (at ${appt.slotTime}).\nBooking ID: ${appt.bookingId}\n\nNeuro Harmony Team`,
            html: `
              <h3>Consultation Reminder</h3>
              <p>Dear Dr. Priyadarshi Srivastava,</p>
              <p>Your consultation with ${appt.patientName} starts in 1 hour.</p>
              <ul>
                <li><strong>Patient Name:</strong> ${appt.patientName} (${appt.patientAge} years)</li>
                <li><strong>Time:</strong> ${appt.slotTime}</li>
              </ul>
            `
          });

          // 4. Log in Notification table
          await prisma.notification.createMany({
            data: [
              {
                userId: appt.patientId,
                type: 'EMAIL',
                recipient: appt.patientEmail,
                message: `1-hour reminder email sent to patient for booking ID ${appt.bookingId}`,
                status: 'SENT'
              },
              {
                userId: appt.patientId,
                type: 'SMS',
                recipient: appt.patientPhone,
                message: `1-hour reminder SMS sent to patient for booking ID ${appt.bookingId}`,
                status: 'SENT'
              },
              {
                userId: appt.doctor.userId,
                type: 'EMAIL',
                recipient: appt.doctor?.user?.email || 'doctor-notifications@neuroharmony.in',
                message: `1-hour reminder email sent to doctor for booking ID ${appt.bookingId}`,
                status: 'SENT'
              }
            ]
          });
        }
      }
    } catch (error) {
      console.error('[Scheduler Error] Failed to process reminders:', error);
    }
  });

  console.log('[Scheduler] 1-hour appointment reminder cron initialized.');
}
