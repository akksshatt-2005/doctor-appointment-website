import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function setupSlots() {
  console.log('=== Setting up Doctor Availability (5:00 PM to 9:00 PM) ===\n');

  try {
    const doctor = await prisma.doctorProfile.findFirst({
      include: { user: true }
    });

    if (!doctor) {
      console.error('No doctor profile found.');
      return;
    }

    console.log(`Setting up templates for Doctor: ${doctor.user.name} (ID: ${doctor.id})`);

    // 1. Delete old templates
    await prisma.availabilityTemplate.deleteMany({
      where: { doctorId: doctor.id }
    });

    // 2. Create weekly templates for 5:00 PM to 9:00 PM (17:00 to 21:00) for all 7 days (0..6)
    const templatesData = [];
    for (let day = 0; day <= 6; day++) {
      templatesData.push({
        doctorId: doctor.id,
        dayOfWeek: day,
        startTime: '17:00',
        endTime: '21:00',
        consultType: 'ONLINE'
      });
    }

    await prisma.availabilityTemplate.createMany({
      data: templatesData
    });
    console.log('Created weekly templates (5:00 PM - 9:00 PM) for all 7 days.');

    // 3. Generate concrete 30-min slots for the next 14 days
    const timeSlots = [
      { start: '17:00', end: '17:30' },
      { start: '17:30', end: '18:00' },
      { start: '18:00', end: '18:30' },
      { start: '18:30', end: '19:00' },
      { start: '19:00', end: '19:30' },
      { start: '19:30', end: '20:00' },
      { start: '20:00', end: '20:30' },
      { start: '20:30', end: '21:00' }
    ];

    const today = new Date();
    let slotCount = 0;

    for (let i = 0; i < 14; i++) {
      const slotDate = new Date();
      slotDate.setDate(today.getDate() + i);
      const year = slotDate.getFullYear();
      const month = slotDate.getMonth();
      const dayVal = slotDate.getDate();
      const utcSlotDate = new Date(Date.UTC(year, month, dayVal, 0, 0, 0, 0));

      for (const ts of timeSlots) {
        await prisma.availabilitySlot.upsert({
          where: {
            unique_doctor_slot: {
              doctorId: doctor.id,
              date: utcSlotDate,
              startTime: ts.start
            }
          },
          update: {
            endTime: ts.end,
            consultType: 'ONLINE'
          },
          create: {
            doctorId: doctor.id,
            date: utcSlotDate,
            startTime: ts.start,
            endTime: ts.end,
            consultType: 'ONLINE',
            isBooked: false
          }
        });
        slotCount++;
      }
    }

    console.log(`Successfully generated/updated ${slotCount} bookable slots for the next 14 days.`);

  } catch (err) {
    console.error('Error setting up slots:', err);
  } finally {
    await prisma.$disconnect();
  }
}

setupSlots();
