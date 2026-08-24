import express from 'express';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';
import {
  getPrescriptionOverview,
  getMedicineAnalytics
} from '../controllers/analyticsController.js';

const router = express.Router();

// Require DOCTOR role for all clinical research and analytics endpoints
router.use(requireAuth, requireRole('DOCTOR'));

router.get('/doctor/analytics/overview', getPrescriptionOverview);
router.get('/doctor/analytics/medicine', getMedicineAnalytics);

export default router;
