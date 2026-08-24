import { PrismaClient } from '@prisma/client';
import { ensureDoctorAvailabilityAndTemplates } from './controllers/slotController.js';

const prisma = new PrismaClient();

async function setupSlots() {
  console.log('=== Setting up Doctor Availability (5:00 PM to 9:00 PM) ===\n');

  try {
    await ensureDoctorAvailabilityAndTemplates();
    console.log('\n[Setup Slots] Complete! 5:00 PM to 9:00 PM slots guaranteed for all dates.');
  } catch (err) {
    console.error('Error setting up slots:', err);
  } finally {
    await prisma.$disconnect();
  }
}

setupSlots();

