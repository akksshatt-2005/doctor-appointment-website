import express from 'express';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';
import {
  createOfflinePrescription,
  getOfflinePrescriptions,
  deleteOfflinePrescription
} from '../controllers/offlinePrescriptionController.js';

const router = express.Router();

// Require both authentication and DOCTOR role for all offline prescription endpoints
router.use(requireAuth, requireRole('DOCTOR'));

router.post('/doctor/offline-prescriptions', createOfflinePrescription);
router.get('/doctor/offline-prescriptions', getOfflinePrescriptions);
router.delete('/doctor/offline-prescriptions/:id', deleteOfflinePrescription);

export default router;
