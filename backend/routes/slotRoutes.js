import express from 'express';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';
import {
  createTemplates,
  getTemplates,
  generateConcreteSlots,
  getDoctorAvailability
} from '../controllers/slotController.js';

const router = express.Router();

// Doctor-authenticated template configuration
router.post('/doctors/templates', requireAuth, requireRole('DOCTOR'), createTemplates);
router.get('/doctors/templates', requireAuth, requireRole('DOCTOR'), getTemplates);

// Doctor-authenticated slots generator
router.post('/doctors/slots/generate', requireAuth, requireRole('DOCTOR'), generateConcreteSlots);

// Public availability lookups
router.get('/doctors/:id/availability', getDoctorAvailability);

// Public list of doctors
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
router.get('/doctors', async (req, res, next) => {
  try {
    const doctors = await prisma.doctorProfile.findMany({
      include: {
        user: {
          select: { name: true, email: true, phone: true }
        }
      }
    });
    return res.status(200).json({ success: true, doctors });
  } catch (error) {
    next(error);
  }
});

export default router;

