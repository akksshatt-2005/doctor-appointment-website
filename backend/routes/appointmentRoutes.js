import express from 'express';
import { requireAuth, requireRole, requireBookingScope } from '../middleware/authMiddleware.js';
import { uploadReportMiddleware } from '../middleware/fileUpload.js';
import {
  bookAppointment,
  getAppointmentDetails,
  getDoctorAppointments,
  uploadReport,
  getPatientAppointments,
  updateAppointmentStatus,
  updateAppointmentStatusByPatient,
  createPrescription,
  createFeedback,
  getJitsiConfig
} from '../controllers/appointmentController.js';

const router = express.Router();

// Patient bookings (requires JWT with booking scope)
router.post('/appointments/book', requireAuth, requireBookingScope, bookAppointment);
router.post('/appointments', requireAuth, requireBookingScope, bookAppointment); // alias as requested

// Patient upload report
router.post('/appointments/:id/upload-report', requireAuth, requireBookingScope, uploadReportMiddleware, uploadReport);

// Patient appointment receipt tracking
router.get('/appointments/:id', requireAuth, getAppointmentDetails);
router.get('/appointments/:id/jitsi-config', requireAuth, getJitsiConfig);

// Patient appointments list
router.get('/appointments', requireAuth, getPatientAppointments);

// Patient update status (completed/no-show/cancelled)
router.patch('/appointments/:id/status', requireAuth, updateAppointmentStatusByPatient);

// Doctor appointments list (requires Doctor auth)
router.get('/doctors/appointments', requireAuth, requireRole('DOCTOR'), getDoctorAppointments);
router.get('/doctor/appointments', requireAuth, requireRole('DOCTOR'), getDoctorAppointments);

// Doctor update status (completed/no-show/cancelled)
router.patch('/doctor/appointments/:id/status', requireAuth, requireRole('DOCTOR'), updateAppointmentStatus);

// Doctor submit prescription (generates PDF & alerts patient)
router.post('/doctor/appointments/:id/prescription', requireAuth, requireRole('DOCTOR'), createPrescription);

// Patient submit feedback for completed appointment
router.post('/appointments/:id/feedback', requireAuth, createFeedback);

export default router;


