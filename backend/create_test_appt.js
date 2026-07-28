import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('--- Creating scheduled appointment for today ---');
  
  // 1. Get Doctor Profile
  const doctor = await prisma.doctorProfile.findFirst({
    include: { user: true }
  });
  if (!doctor) {
    console.error('No doctor found! Seed database first.');
    return;
  }
  console.log(`Using Doctor: ${doctor.user.name}`);

  // 2. Get or Create Patient (Akshat Srivastava, 8090589401)
  let patient = await prisma.user.findFirst({
    where: { phone: '8090589401' }
  });
  if (!patient) {
    patient = await prisma.user.create({
      data: {
        name: 'Akshat Srivastava',
        phone: '8090589401',
        role: 'PATIENT',
        email: 'akshat@example.com'
      }
    });
  }
  console.log(`Using Patient: ${patient.name}`);

  // 3. Create Slot for Today
  const today = new Date();
  
  // Clean up any conflicting slots for this doctor today
  await prisma.availabilitySlot.deleteMany({
    where: {
      doctorId: doctor.id,
      date: today,
      startTime: '19:30'
    }
  });

  const slot = await prisma.availabilitySlot.create({
    data: {
      doctorId: doctor.id,
      date: today,
      startTime: '19:30',
      endTime: '20:00',
      isBooked: true,
      consultType: 'ONLINE'
    }
  });
  console.log(`Created slot: ${slot.startTime} on ${slot.date.toDateString()}`);

  // 4. Create Scheduled Appointment
  const bookingId = 'NH-' + Math.floor(100000 + Math.random() * 900000);
  
  // Delete any active scheduled appointments for today to keep it clean
  await prisma.appointment.deleteMany({
    where: {
      patientId: patient.id,
      status: 'SCHEDULED'
    }
  });

  const appt = await prisma.appointment.create({
    data: {
      bookingId: bookingId,
      patientId: patient.id,
      doctorId: doctor.id,
      slotId: slot.id,
      appointmentDate: today,
      slotTime: '07:30 PM',
      patientName: patient.name,
      patientAge: 25,
      patientEmail: patient.email || 'akshat@example.com',
      patientPhone: patient.phone,
      symptoms: 'Experiencing minor sleep anxiety and headache.',
      status: 'SCHEDULED',
      videoRoomId: `nh-${bookingId.toLowerCase()}`
    }
  });
  console.log(`Successfully created SCHEDULED appointment: ${appt.bookingId}`);
  
  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
