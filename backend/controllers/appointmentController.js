import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { notifyAppointmentBooking, sendEmail, sendSms } from '../services/notificationService.js';
import { getStorageProvider } from '../services/storageService.js';
import jwt from 'jsonwebtoken';


const prisma = new PrismaClient();

/**
 * Public/Patient booking endpoint.
 * Requires scope Complete Booking token.
 * Double-booking prevention via Prisma Transaction.
 */
export async function bookAppointment(req, res, next) {
  const {
    slotId,
    patientName,
    patientAge,
    patientEmail,
    patientPhone,
    symptoms,
    reportFilePath
  } = req.body;

  if (!slotId || !patientName || !patientAge || !patientEmail || !patientPhone || !symptoms) {
    return res.status(400).json({
      success: false,
      message: 'Please provide all required patient details and slot ID.'
    });
  }

  try {
    // Perform database transaction to guarantee slot is locked and booked atomically
    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch slot with lock (standard select for update if supported, or read-check-write)
      const slot = await tx.availabilitySlot.findUnique({
        where: { id: slotId }
      });

      if (!slot) {
        throw new Error('SlotNotFound');
      }

      // Multiple users are allowed to book slots for the same timing

      // 2. Retrieve patient user (auth details inside req.user.phone)
      const patientUser = await tx.user.findUnique({
        where: { phone: req.user.phone }
      });

      if (!patientUser) {
        throw new Error('PatientNotFound');
      }

      // 3. Retrieve doctor details
      const doctorProfile = await tx.doctorProfile.findUnique({
        where: { id: slot.doctorId }
      });

      // 4. Generate unique human-readable booking ID (e.g. NH-293108)
      let bookingId = '';
      let isUnique = false;
      while (!isUnique) {
        const randomNum = crypto.randomInt(100000, 999999).toString();
        bookingId = `NH-${randomNum}`;
        const existing = await tx.appointment.findUnique({
          where: { bookingId }
        });
        if (!existing) isUnique = true;
      }

      // 5. Generate video call room ID
      const videoRoomId = `room-${bookingId.toLowerCase()}`;

      // 6. Mark slot as booked
      await tx.availabilitySlot.update({
        where: { id: slotId },
        data: { isBooked: true }
      });

      // 7. Create Appointment
      const appointment = await tx.appointment.create({
        data: {
          bookingId,
          patientId: patientUser.id,
          doctorId: slot.doctorId,
          slotId: slot.id,
          appointmentDate: slot.date,
          slotTime: formatTimeLabel(slot.startTime),
          patientName,
          patientAge: parseInt(patientAge, 10),
          patientEmail,
          patientPhone,
          symptoms,
          reportFilePath: reportFilePath || null,
          videoRoomId,
          status: 'PENDING_PAYMENT' // status transitions to SCHEDULED after payment capture
        }
      });

      // 8. Create associated Payment record (pending status)
      const payment = await tx.payment.create({
        data: {
          appointmentId: appointment.id,
          razorpayOrderId: `order_mock_${bookingId}_${Date.now()}`, // Temporary order ID, updated during Razorpay trigger
          amount: doctorProfile.consultationFee,
          status: 'PENDING'
        }
      });

      return { appointment, bookingId, payment };
    });

    return res.status(201).json({
      success: true,
      message: 'Slot reserved successfully. Proceed to payment.',
      bookingId: result.bookingId,
      appointmentId: result.appointment.id,
      amount: result.payment.amount,
      razorpayOrderId: result.payment.razorpayOrderId
    });

  } catch (error) {
    if (error.message === 'SlotNotFound') {
      return res.status(404).json({
        success: false,
        message: 'The requested slot does not exist.'
      });
    }
    if (error.message === 'SlotAlreadyBooked') {
      return res.status(400).json({
        success: false,
        message: 'This slot has already been booked by another patient.'
      });
    }
    if (error.message === 'PatientNotFound') {
      return res.status(401).json({
        success: false,
        message: 'Patient profile matching authentication token was not found.'
      });
    }
    next(error);
  }
}

/**
 * Get appointment booking details by ID (used for patient receipt / tracking page).
 */
export async function getAppointmentDetails(req, res, next) {
  const { id } = req.params;

  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        payment: true,
        prescription: true,
        feedback: true
      }
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found.'
      });
    }

    // Role-based protection: patient can only view their own appointments
    if (req.user.role === 'PATIENT' || req.user.role === 'patient') {
      if (req.user.phone !== appointment.patientPhone) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden. You do not have access to view this appointment.'
        });
      }
    } else if (req.user.role === 'DOCTOR' || req.user.role === 'doctor') {
      const doctorProfile = await prisma.doctorProfile.findUnique({
        where: { userId: req.user.id }
      });
      if (!doctorProfile || doctorProfile.id !== appointment.doctorId) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden. You are not the assigned doctor for this appointment.'
        });
      }
    } else if (req.user.role !== 'ADMIN' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. Invalid user role.'
      });
    }

    return res.status(200).json({
      success: true,
      appointment
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Doctor-authenticated endpoint: List all appointments for the doctor.
 */
export async function getDoctorAppointments(req, res, next) {
  try {
    const doctorProfile = await prisma.doctorProfile.findUnique({
      where: { userId: req.user.id }
    });

    if (!doctorProfile) {
      return res.status(404).json({
        success: false,
        message: 'Doctor profile not found.'
      });
    }

    const appointments = await prisma.appointment.findMany({
      where: { doctorId: doctorProfile.id },
      include: {
        payment: true,
        prescription: true,
        feedback: true
      },
      orderBy: {
        appointmentDate: 'desc'
      }
    });

    return res.status(200).json({
      success: true,
      appointments
    });
  } catch (error) {
    next(error);
  }
}

// Helper to convert HH:MM to 12 hour AM/PM label
function formatTimeLabel(timeStr) {
  let [hours, minutes] = timeStr.split(':').map(Number);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const strMinutes = minutes < 10 ? '0' + minutes : minutes;
  const strHours = hours < 10 ? '0' + hours : hours;
  return `${strHours}:${strMinutes} ${ampm}`;
}

/**
 * Patient upload report endpoint.
 * Accepts a single file upload (via multer middleware).
 * Stores file locally (via local storage provider) and saves path.
 */
export async function uploadReport(req, res, next) {
  const { id } = req.params;

  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'Please upload a PDF or image file.'
    });
  }

  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id }
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found.'
      });
    }

    // Patient ownership check
    if (req.user.phone !== appointment.patientPhone) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not have permission to upload reports for this appointment.'
      });
    }

    const storage = getStorageProvider();
    const filePath = await storage.uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype);

    const fileUrl = await storage.getFileUrl(filePath);

    // Update appointment report path
    await prisma.appointment.update({
      where: { id },
      data: { reportFilePath: fileUrl }
    });

    return res.status(200).json({
      success: true,
      message: 'Report uploaded successfully.',
      reportFilePath: fileUrl
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get all appointments for the logged in patient (based on phone token matching).
 */
export async function getPatientAppointments(req, res, next) {
  try {
    const patientUser = await prisma.user.findUnique({
      where: { phone: req.user.phone }
    });

    if (!patientUser) {
      return res.status(404).json({
        success: false,
        message: 'Patient profile not found.'
      });
    }

    const appointments = await prisma.appointment.findMany({
      where: { patientId: patientUser.id },
      include: {
        payment: true,
        prescription: true,
        feedback: true
      },
      orderBy: {
        appointmentDate: 'desc'
      }
    });

    return res.status(200).json({
      success: true,
      appointments
    });
  } catch (error) {
    next(error);
  }
}

export async function updateAppointmentStatus(req, res, next) {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a status.'
    });
  }

  try {
    const updated = await prisma.appointment.update({
      where: { id },
      data: { status }
    });

    const io = req.app.get('io');
    if (io) {
      if (status === 'COMPLETED') {
        io.to(updated.bookingId).emit('consultation_ended');
      }
      io.emit('appointment_updated', {
        appointmentId: updated.id,
        bookingId: updated.bookingId,
        status: updated.status
      });
    }

    return res.status(200).json({
      success: true,
      message: `Appointment status updated to ${status}.`,
      appointment: updated
    });
  } catch (error) {
    next(error);
  }
}

export async function updateAppointmentStatusByPatient(req, res, next) {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a status.'
    });
  }

  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id }
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found.'
      });
    }

    // Secure check: verify that this is indeed the patient's appointment
    if (req.user.phone !== appointment.patientPhone) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not have permission to update this appointment status.'
      });
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: { status }
    });

    const io = req.app.get('io');
    if (io) {
      if (status === 'COMPLETED') {
        io.to(updated.bookingId).emit('consultation_ended');
      }
      io.emit('appointment_updated', {
        appointmentId: updated.id,
        bookingId: updated.bookingId,
        status: updated.status
      });
    }

    return res.status(200).json({
      success: true,
      message: `Appointment status updated to ${status}.`,
      appointment: updated
    });
  } catch (error) {
    next(error);
  }
}

export async function createPrescription(req, res, next) {
  const { id } = req.params;
  const { diagnosis, medications, advice, useLetterhead } = req.body;

  if (!diagnosis || !medications || !Array.isArray(medications)) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a diagnosis and an array of medications.'
    });
  }

  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: { doctor: true }
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found.'
      });
    }

    // Save prescription in database
    const rx = await prisma.prescription.upsert({
      where: { appointmentId: id },
      update: {
        diagnosis,
        medications: JSON.stringify(medications),
        advice
      },
      create: {
        appointmentId: id,
        diagnosis,
        medications: JSON.stringify(medications),
        advice
      }
    });

    // Generate PDF prescription
    const dirPath = path.resolve('uploads/prescriptions');
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    const pdfFilename = `prescription-${appointment.bookingId}.pdf`;
    const pdfPath = path.join(dirPath, pdfFilename);

    const doc = new PDFDocument({
      size: 'A4',
      margins: useLetterhead
        ? { top: 198, bottom: 126, left: 50, right: 50 }
        : { top: 50, bottom: 50, left: 50, right: 50 }
    });
    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    if (!useLetterhead) {
      // 1. Premium Letterhead Header
      doc.fillColor('#0f766e').font('Helvetica-Bold').fontSize(22).text('NEURO HARMONY CLINIC', 50, 50);
      doc.fillColor('#475569').font('Helvetica').fontSize(9.5).text('Mind & Brain Specialist Centre', 50, 76);
      doc.fillColor('#64748b').fontSize(8.5).text('Ugf 19, Subash Chandra Bose Complex, Chowk, Lucknow, UP', 50, 90);

      doc.fillColor('#0d9488').font('Helvetica-Bold').fontSize(11).text('Consultant Neuropsychiatrist', 350, 50, { align: 'right', width: 195 });
      doc.fillColor('#1e293b').font('Helvetica').fontSize(9.5).text('Dr. Priyadarshi Srivastava', 350, 66, { align: 'right', width: 195 });
      doc.fillColor('#64748b').fontSize(8.5).text('Telemedicine Consultation', 350, 80, { align: 'right', width: 195 });

      // Teal Divider Line
      doc.strokeColor('#0d9488').lineWidth(1.5).moveTo(50, 120).lineTo(545, 120).stroke();
    }

    const startY = useLetterhead ? 198 : 136;
    const patientMetaBoxY = startY + 12;

    // 2. Structured Patient Information Grid
    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(8).text('PATIENT METADATA', 50, startY);

    // Box border
    doc.rect(50, patientMetaBoxY, 495, 54).lineWidth(1).strokeColor('#cbd5e1').stroke();
    // Vertical splitter line
    doc.moveTo(297, patientMetaBoxY).lineTo(297, patientMetaBoxY + 54).strokeColor('#cbd5e1').stroke();
    // Horizontal splitter line
    doc.moveTo(50, patientMetaBoxY + 27).lineTo(545, patientMetaBoxY + 27).strokeColor('#cbd5e1').stroke();

    // Metadata entries
    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5).text('PATIENT NAME', 60, patientMetaBoxY + 6);
    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(9.5).text(appointment.patientName, 60, patientMetaBoxY + 15);

    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5).text('DATE OF CONSULTATION', 307, patientMetaBoxY + 6);
    doc.fillColor('#1e293b').font('Helvetica').fontSize(9.5).text(new Date(appointment.appointmentDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }), 307, patientMetaBoxY + 15);

    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5).text('AGE / GENDER', 60, patientMetaBoxY + 33);
    doc.fillColor('#1e293b').font('Helvetica').fontSize(9.5).text(`${appointment.patientAge} Yrs / Self`, 60, patientMetaBoxY + 42);

    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5).text('RX ID / BOOKING ID', 307, patientMetaBoxY + 33);
    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(9.5).text(appointment.bookingId, 307, patientMetaBoxY + 42);

    // 3. Medications Title with Decorative Rx Symbol
    const rxSymbolY = patientMetaBoxY + 54 + 16;
    doc.fillColor('#0d9488').font('Helvetica-Bold').fontSize(26).text('℞', 50, rxSymbolY);
    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(11).text('PRESCRIBED MEDICATIONS', 78, rxSymbolY + 8);

    // 4. Modern Medications Table
    let tableY = 252;
    // Header Row Background
    doc.rect(50, tableY, 495, 20).fill('#0f766e');
    
    // Header Column Labels
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5);
    doc.text('MEDICINE (GENERIC / BRAND)', 60, tableY + 6, { width: 220 });
    doc.text('DOSAGE', 280, tableY + 6, { width: 110 });
    doc.text('FREQUENCY & INSTRUCTIONS', 400, tableY + 6, { width: 130 });

    let currentY = tableY + 20;

    medications.forEach((med, idx) => {
      const hasComposition = !!(med.composition && med.composition.trim());
      const rowHeight = hasComposition ? 34 : 24;

      // Alternating row background shading
      if (idx % 2 === 1) {
        doc.rect(50, currentY, 495, rowHeight).fill('#f8fafc');
      }
      
      if (hasComposition) {
        doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(9.5).text(med.name, 60, currentY + 5, { width: 220 });
        doc.fillColor('#b91c1c').font('Helvetica-Oblique').fontSize(8).text(`(${med.composition.trim()})`, 60, currentY + 17, { width: 220 });
        
        doc.fillColor('#475569').font('Helvetica').fontSize(9.5).text(med.dosage, 280, currentY + 11, { width: 110 });
        doc.fillColor('#475569').font('Helvetica').fontSize(9.5).text(med.frequency || med.freq || '', 400, currentY + 11, { width: 135 });
      } else {
        doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(9.5).text(med.name, 60, currentY + 7, { width: 220 });
        doc.fillColor('#475569').font('Helvetica').fontSize(9.5).text(med.dosage, 280, currentY + 7, { width: 110 });
        doc.fillColor('#475569').font('Helvetica').fontSize(9.5).text(med.frequency || med.freq || '', 400, currentY + 7, { width: 135 });
      }

      // Clean bottom border divider
      doc.strokeColor('#f1f5f9').lineWidth(1).moveTo(50, currentY + rowHeight).lineTo(545, currentY + rowHeight).stroke();
      currentY += rowHeight;
    });

    currentY += 16;

    // 5. Styled Card Panels for Notes & Advice
    // Diagnosis Card
    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(8).text('DIAGNOSIS & CLINICAL NOTES', 50, currentY);
    currentY += 12;

    const diagTextHeight = doc.heightOfString(diagnosis, { width: 465 });
    const diagCardHeight = Math.max(diagTextHeight + 16, 40);

    doc.rect(50, currentY, 495, diagCardHeight).fill('#f8fafc');
    doc.rect(50, currentY, 4, diagCardHeight).fill('#0f766e'); // Accent bar
    doc.rect(50, currentY, 495, diagCardHeight).lineWidth(1).strokeColor('#e2e8f0').stroke();

    doc.fillColor('#1e293b').font('Helvetica').fontSize(9.5).text(diagnosis, 65, currentY + 8, { width: 465, lineGap: 2 });
    currentY += diagCardHeight + 16;

    // Advice Card
    if (advice) {
      doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(8).text('GENERAL ADVICE & FOLLOW-UP INSTRUCTIONS', 50, currentY);
      currentY += 12;

      const adviceTextHeight = doc.heightOfString(advice, { width: 465 });
      const adviceCardHeight = Math.max(adviceTextHeight + 16, 40);

      doc.rect(50, currentY, 495, adviceCardHeight).fill('#f0fdfa'); // Teal shade
      doc.rect(50, currentY, 4, adviceCardHeight).fill('#0d9488'); // Dark Teal bar
      doc.rect(50, currentY, 495, adviceCardHeight).lineWidth(1).strokeColor('#ccfbf1').stroke();

      doc.fillColor('#0f766e').font('Helvetica-Oblique').fontSize(9.5).text(advice, 65, currentY + 8, { width: 465, lineGap: 2 });
    }

    // 6. Signature block (Anchored at the bottom)
    const sigY = useLetterhead ? 640 : 710;
    doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(350, sigY).lineTo(545, sigY).stroke();
    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(10).text('Dr. Priyadarshi Srivastava', 350, sigY + 6, { align: 'right', width: 195 });
    doc.fillColor('#64748b').font('Helvetica').fontSize(8.5).text('Consultant Neuropsychiatrist\nNeuro Harmony Clinic', 350, sigY + 19, { align: 'right', width: 195 });

    // Digital Authentication Note
    if (!useLetterhead) {
      doc.fillColor('#94a3b8').font('Helvetica').fontSize(8).text('This is a digitally generated secure e-Prescription. Signature not required for digital validity.', 50, 765, { align: 'center', width: 495 });
    }

    doc.end();

    // Wait for the PDF to be fully written to disk
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    // Upload file using storage provider
    const fileBuffer = fs.readFileSync(pdfPath);
    const storage = getStorageProvider();
    const uploadedPath = await storage.uploadFile(fileBuffer, pdfFilename, 'application/pdf');
    const pdfUrl = await storage.getFileUrl(uploadedPath);

    // Update prescription in database with pdfUrl
    await prisma.prescription.update({
      where: { appointmentId: id },
      data: { pdfUrl }
    });

    const io = req.app.get('io');
    if (io) {
      io.to(appointment.bookingId).emit('prescription_ready', { pdfUrl });
      io.emit('appointment_updated', {
        appointmentId: appointment.id,
        bookingId: appointment.bookingId,
        status: appointment.status,
        pdfUrl
      });
    }

    // Notify patient
    const downloadLink = pdfUrl.startsWith('http') ? pdfUrl : `http://localhost:5000${pdfUrl}`;
    await sendEmail({
      to: appointment.patientEmail,
      subject: `Prescription Generated - Booking ID: ${appointment.bookingId}`,
      text: `Dear ${appointment.patientName},\n\nDr. Priyadarshi Srivastava has issued your prescription for booking ${appointment.bookingId}.\nDownload it here: ${downloadLink}\n\nNeuro Harmony Team`,
      html: `
        <h3>Prescription Document Ready</h3>
        <p>Dear ${appointment.patientName},</p>
        <p>Dr. Priyadarshi Srivastava has generated your consultation prescription.</p>
        <p>You can download it using the link below:</p>
        <p><a href="${downloadLink}" style="display:inline-block; padding:0.5rem 1rem; color:#fff; background-color:#0f766e; text-decoration:none; border-radius:4px;">Download Prescription PDF</a></p>
        <p>Alternatively, log in to your patient dashboard to download it anytime.</p>
      `
    });

    await sendSms(
      appointment.patientPhone,
      `Your prescription is ready. Download PDF: ${downloadLink}`
    );

    // Log the notification
    await prisma.notification.create({
      data: {
        userId: appointment.patientId,
        type: 'EMAIL',
        recipient: appointment.patientEmail,
        message: `Prescription generated notification with PDF download link for booking ${appointment.bookingId}`,
        status: 'SENT'
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Prescription generated and patient notified.',
      prescription: rx,
      pdfUrl
    });

  } catch (error) {
    next(error);
  }
}

export async function createFeedback(req, res, next) {
  const { id } = req.params;
  const { rating, comment } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid rating between 1 and 5.'
    });
  }

  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id }
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found.'
      });
    }

    const feedback = await prisma.feedback.upsert({
      where: { appointmentId: id },
      update: {
        rating: parseInt(rating, 10),
        comment
      },
      create: {
        appointmentId: id,
        patientId: appointment.patientId,
        rating: parseInt(rating, 10),
        comment
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully.',
      feedback
    });
  } catch (error) {
    next(error);
  }
}

export async function getJitsiConfig(req, res, next) {
  const { id } = req.params;

  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        doctor: {
          include: {
            user: true
          }
        }
      }
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found.'
      });
    }

    // Role-based protection: patient can only view their own appointments
    let isDoctor = false;
    if (req.user.role === 'PATIENT' || req.user.role === 'patient') {
      if (req.user.phone !== appointment.patientPhone) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden. You do not have access to view this appointment.'
        });
      }
    } else if (req.user.role === 'DOCTOR' || req.user.role === 'doctor') {
      const doctorProfile = await prisma.doctorProfile.findUnique({
        where: { userId: req.user.id }
      });
      if (!doctorProfile || doctorProfile.id !== appointment.doctorId) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden. You are not the assigned doctor for this appointment.'
        });
      }
      isDoctor = true;
    } else if (req.user.role !== 'ADMIN' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. Invalid user role.'
      });
    }

    let displayName = appointment.patientName;
    let email = appointment.patientEmail;
    let isModerator = false;

    if (isDoctor) {
      displayName = appointment.doctor?.user?.name || 'Dr. Priyadarshi Srivastava';
      email = appointment.doctor?.user?.email || 'doctor@neuroharmonyclinic.in';
      isModerator = true;
    }

    // Check JaaS config
    const jaasAppId = process.env.JITSI_JAAS_APP_ID;
    const jaasKeyId = process.env.JITSI_JAAS_KEY_ID;
    let jaasPrivateKey = process.env.JITSI_JAAS_PRIVATE_KEY;

    if (jaasAppId && jaasKeyId && !jaasPrivateKey) {
      const keyPath = path.resolve('jitsi_private_key.pk');
      if (fs.existsSync(keyPath)) {
        try {
          jaasPrivateKey = fs.readFileSync(keyPath, 'utf8');
        } catch (err) {
          console.error('Failed to read local jitsi_private_key.pk file:', err);
        }
      }
    }

    let domain = 'meet.jit.si';
    let roomName = appointment.videoRoomId || `room-${appointment.bookingId.toLowerCase()}`;
    let token = null;

    if (jaasAppId && jaasKeyId && jaasPrivateKey) {
      domain = '8x8.vc';
      roomName = `${jaasAppId}/${roomName}`;

      // Generate JWT for JaaS
      const payload = {
        iss: 'chat',
        sub: jaasAppId,
        aud: 'jitsi',
        room: '*',
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour expiry
        nbf: Math.floor(Date.now() / 1000) - 10,
        context: {
          user: {
            id: req.user.id,
            name: displayName,
            email: email,
            moderator: isModerator
          },
          features: {
            'screen-sharing': true,
            recording: isModerator,
            livestreaming: false
          }
        }
      };

      try {
        token = jwt.sign(payload, jaasPrivateKey, {
          algorithm: 'RS256',
          header: {
            kid: jaasKeyId,
            alg: 'RS256',
            typ: 'JWT'
          }
        });
      } catch (jwtErr) {
        console.error('Failed to sign Jitsi JaaS JWT, falling back to public domain:', jwtErr);
        domain = 'meet.jit.si';
        roomName = appointment.videoRoomId || `room-${appointment.bookingId.toLowerCase()}`;
      }
    }

    return res.status(200).json({
      success: true,
      domain,
      roomName,
      jwt: token,
      displayName,
      email
    });

  } catch (error) {
    next(error);
  }
}



