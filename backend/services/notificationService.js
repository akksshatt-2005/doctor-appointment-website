import { Resend } from 'resend';
import fs from 'fs';
import path from 'path';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM || 'Neuro Harmony <onboarding@resend.dev>';

// ─── Beautiful HTML Email Templates ───────────────────────────────────────────

function baseTemplate(content) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Neuro Harmony</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0f766e 0%,#134e4a 100%);padding:36px 40px;text-align:center;">
            <div style="display:inline-flex;align-items:center;gap:10px;">
              <span style="font-size:28px;">🧠</span>
              <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">Neuro Harmony Clinic</span>
            </div>
            <p style="color:#ccfbf1;margin:8px 0 0;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Telehealth & Neuropsychiatry</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            ${content}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:24px 40px;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">
              © 2026 Neuro Harmony Clinic · Dr. Priyadarshi Srivastava<br/>
              This is an automated email — please do not reply.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function appointmentConfirmedTemplate(appt) {
  const dateStr = new Date(appt.appointmentDate).toDateString();
  return baseTemplate(`
    <div style="text-align:center;margin-bottom:32px;">
      <div style="width:64px;height:64px;background:#dcfce7;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:28px;margin-bottom:16px;">✅</div>
      <h1 style="margin:0;color:#0f172a;font-size:24px;font-weight:700;">Appointment Confirmed!</h1>
      <p style="margin:8px 0 0;color:#64748b;font-size:15px;">Your video consultation has been successfully booked.</p>
    </div>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:24px;margin-bottom:24px;">
      <p style="margin:0 0 16px;color:#15803d;font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Booking Details</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:8px 0;color:#475569;font-size:14px;width:40%;">📋 Booking ID</td>
          <td style="padding:8px 0;color:#0f172a;font-weight:700;font-size:14px;">${appt.bookingId}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#475569;font-size:14px;">👨‍⚕️ Doctor</td>
          <td style="padding:8px 0;color:#0f172a;font-weight:600;font-size:14px;">Dr. Priyadarshi Srivastava</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#475569;font-size:14px;">📅 Date</td>
          <td style="padding:8px 0;color:#0f172a;font-weight:600;font-size:14px;">${dateStr}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#475569;font-size:14px;">⏰ Time</td>
          <td style="padding:8px 0;color:#0f172a;font-weight:600;font-size:14px;">${appt.slotTime}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#475569;font-size:14px;">💳 Amount Paid</td>
          <td style="padding:8px 0;color:#0f172a;font-weight:600;font-size:14px;">₹700</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#475569;font-size:14px;">📹 Mode</td>
          <td style="padding:8px 0;color:#0f172a;font-weight:600;font-size:14px;">Online Video Consultation</td>
        </tr>
      </table>
    </div>

    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:20px;margin-bottom:24px;">
      <p style="margin:0 0 8px;color:#1d4ed8;font-weight:600;font-size:13px;">📌 How to Join Your Consultation</p>
      <p style="margin:0;color:#475569;font-size:14px;line-height:1.6;">
        Log in to the <strong>Patient Portal</strong> and click <strong>"Join Video Room"</strong> on your appointment card when it's time for your consultation. Make sure your camera and microphone are working.
      </p>
    </div>

    <div style="text-align:center;">
      <p style="margin:0;color:#64748b;font-size:13px;">Questions? Contact us at <a href="mailto:support@neuroharmony.in" style="color:#0f766e;">support@neuroharmony.in</a></p>
    </div>
  `);
}

function newAppointmentDoctorTemplate(appt) {
  const dateStr = new Date(appt.appointmentDate).toDateString();
  return baseTemplate(`
    <div style="text-align:center;margin-bottom:32px;">
      <div style="width:64px;height:64px;background:#fef3c7;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:28px;margin-bottom:16px;">📅</div>
      <h1 style="margin:0;color:#0f172a;font-size:24px;font-weight:700;">New Appointment Booked</h1>
      <p style="margin:8px 0 0;color:#64748b;font-size:15px;">A patient has confirmed a video consultation with you.</p>
    </div>

    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:24px;margin-bottom:24px;">
      <p style="margin:0 0 16px;color:#92400e;font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Patient Details</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:8px 0;color:#475569;font-size:14px;width:40%;">👤 Patient</td>
          <td style="padding:8px 0;color:#0f172a;font-weight:600;font-size:14px;">${appt.patientName} (${appt.patientAge} yrs)</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#475569;font-size:14px;">📋 Booking ID</td>
          <td style="padding:8px 0;color:#0f172a;font-weight:700;font-size:14px;">${appt.bookingId}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#475569;font-size:14px;">📅 Date</td>
          <td style="padding:8px 0;color:#0f172a;font-weight:600;font-size:14px;">${dateStr}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#475569;font-size:14px;">⏰ Time</td>
          <td style="padding:8px 0;color:#0f172a;font-weight:600;font-size:14px;">${appt.slotTime}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#475569;font-size:14px;">🩺 Symptoms</td>
          <td style="padding:8px 0;color:#0f172a;font-weight:600;font-size:14px;">${appt.symptoms || 'Not specified'}</td>
        </tr>
      </table>
    </div>

    <div style="text-align:center;">
      <a href="${process.env.CLIENT_URL_DOCTOR || 'http://localhost:4000'}" 
         style="display:inline-block;background:linear-gradient(135deg,#0f766e,#134e4a);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;">
        Open Doctor Portal →
      </a>
    </div>
  `);
}

// ─── Core sendEmail function using Resend ──────────────────────────────────────

export async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey || apiKey.includes('your_')) {
    console.log(`[Email] Resend API key not configured. Skipping email to ${to}`);
    return null;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: [to],
      subject,
      html,
      text
    });

    if (error) {
      console.error(`[Email Error] Resend failed for ${to}:`, error.message);
      return null;
    }

    console.log(`[Email] ✅ Sent to ${to} | ID: ${data.id} | Subject: "${subject}"`);
    return data;
  } catch (err) {
    console.error(`[Email Error] Exception sending to ${to}:`, err.message);
    return null;
  }
}

// ─── SMS (Stubbed — SMS provider not yet configured) ──────────────────────────

export async function sendSms(phone, message) {
  try {
    console.log(`\n================== STUBBED SMS SENDER ==================`);
    console.log(`TO: ${phone}`);
    console.log(`MSG: ${message}`);
    console.log(`API KEY: ${process.env.MSG91_API_KEY ? 'CONFIGURED' : 'MISSING'}`);
    console.log(`========================================================\n`);

    try {
      const logPath = path.resolve('sms_log.txt');
      fs.appendFileSync(logPath, `[${new Date().toISOString()}] TO: ${phone} | MSG: ${message}\n`);
    } catch (writeErr) {
      console.error('Failed to write to sms_log.txt:', writeErr);
    }

    await new Promise(resolve => setTimeout(resolve, 300));
    return { success: true, provider: 'stub', messageId: `msg_${Date.now()}` };
  } catch (error) {
    console.error(`[SMS Error] Failed to send to ${phone}:`, error);
    return { success: false, error: error.message };
  }
}

// ─── Orchestrators ─────────────────────────────────────────────────────────────

export async function notifyAppointmentBooking(appointment) {
  const dateStr = new Date(appointment.appointmentDate).toDateString();

  // 1. Email to Doctor
  const doctorEmail = appointment.doctor?.user?.email || 'doctor@neuroharmony.in';
  await sendEmail({
    to: doctorEmail,
    subject: `📅 New Appointment — ${appointment.patientName} on ${dateStr}`,
    html: newAppointmentDoctorTemplate(appointment),
    text: `New appointment booked by ${appointment.patientName} on ${dateStr} at ${appointment.slotTime}. Booking ID: ${appointment.bookingId}.`
  });

  // 2. Email to Patient
  if (appointment.patientEmail) {
    await sendEmail({
      to: appointment.patientEmail,
      subject: `✅ Appointment Confirmed — Booking ID: ${appointment.bookingId}`,
      html: appointmentConfirmedTemplate(appointment),
      text: `Your consultation with Dr. Priyadarshi Srivastava on ${dateStr} at ${appointment.slotTime} is confirmed. Booking ID: ${appointment.bookingId}.`
    });
  }

  // 3. SMS to Patient
  await sendSms(
    appointment.patientPhone,
    `Your consultation with Dr. Priyadarshi on ${dateStr} at ${appointment.slotTime} is confirmed. Booking ID: ${appointment.bookingId}.`
  );
}

export async function sendOtpCode(phone, code) {
  const message = `Your Neuro Harmony verification OTP is ${code}. Valid for 5 minutes. Do not share this code.`;
  return await sendSms(phone, message);
}
