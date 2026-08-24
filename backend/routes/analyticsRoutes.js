import express from 'express';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';
import {
  getPrescriptionOverview,
  getMedicineAnalytics,
  getPatientVolumeAnalytics
} from '../controllers/analyticsController.js';

const router = express.Router();

// Require DOCTOR role for all clinical research and analytics endpoints
router.use(requireAuth, requireRole('DOCTOR'));

router.get('/doctor/analytics/overview', getPrescriptionOverview);
router.get('/doctor/analytics/medicine', getMedicineAnalytics);
router.get('/doctor/analytics/patient-volume', getPatientVolumeAnalytics);

export default router;
