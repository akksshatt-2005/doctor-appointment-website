import express from 'express';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';
import {
  addMedicine,
  getMedicines,
  updateMedicine,
  deleteMedicine
} from '../controllers/medicineController.js';

const router = express.Router();

// Require DOCTOR role for all medicine endpoints
router.use(requireAuth, requireRole('DOCTOR'));

router.post('/doctor/medicines', addMedicine);
router.get('/doctor/medicines', getMedicines);
router.put('/doctor/medicines/:id', updateMedicine);
router.delete('/doctor/medicines/:id', deleteMedicine);

export default router;
