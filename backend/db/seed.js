import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding...');

  // Check if database already has users/data to prevent accidental overwrites
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    console.log('Database already has data. Skipping seeding to prevent data loss.');
    return;
  }

  // 1. Clean Database
  console.log('Cleaning existing data...');
  await prisma.feedback.deleteMany({});
  await prisma.prescription.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.appointment.deleteMany({});
  await prisma.availabilitySlot.deleteMany({});
  await prisma.doctorProfile.deleteMany({});
  await prisma.otpCode.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.user.deleteMany({});

  // 2. Create Doctor User
  console.log('Creating Doctor user...');
  const doctorPasswordHash = await bcrypt.hash('doctor123', 10);
  const doctorUser = await prisma.user.create({
    data: {
      name: 'Dr. Priyadarshi Srivastava',
      email: 'doctor@neuroharmony.in',
      phone: '9876543210',
      passwordHash: doctorPasswordHash,
      role: 'DOCTOR',
      doctorProfile: {
        create: {
          specialization: 'Leading Neuropsychiatrist',
          qualification: 'MBBS, DPM, DNB (Neuropsychiatry)',
          bio: 'Dr. Priyadarshi Srivastava is one of India\'s leading neuropsychiatrists with over 15 years of experience in clinical care for psychiatric, cognitive, and neuropsychiatric disorders.',
          experienceYears: 15,
          consultationFee: 700.00,
          avatarUrl: '/doctor-avatar.jpg'
        }
      }
    },
    include: {
      doctorProfile: true
    }
  });

  const doctorProfileId = doctorUser.doctorProfile.id;
  console.log(`Doctor user and profile created with ID: ${doctorUser.id}`);

  // 3. Create Patient Users
  console.log('Creating sample Patient users...');
  const patientData = [
    { name: 'Rahul Verma', phone: '9912345678', email: 'rahul.verma@example.com' },
    { name: 'Priya Sen', phone: '9898912345', email: 'priya.sen@example.com' },
    { name: 'Amit Singh', phone: '9765432100', email: 'amit.singh@example.com' },
    { name: 'Meera Nair', phone: '9543210987', email: 'meera.nair@example.com' }
  ];

  const patients = [];
  for (const p of patientData) {
    const user = await prisma.user.create({
      data: {
        name: p.name,
        phone: p.phone,
        email: p.email,
        role: 'PATIENT'
      }
    });
    patients.push(user);
  }

  // 4. Create Seed Availability Slots for the next 7 days
  console.log('Creating availability slots...');
  const today = new Date();
  const timeSlots = [
    { start: '17:00', end: '17:30', label: '05:00 PM' },
    { start: '17:30', end: '18:00', label: '05:30 PM' },
    { start: '18:00', end: '18:30', label: '06:00 PM' },
    { start: '18:30', end: '19:00', label: '06:30 PM' },
    { start: '19:00', end: '19:30', label: '07:00 PM' },
    { start: '19:30', end: '20:00', label: '07:30 PM' },
    { start: '20:00', end: '20:30', label: '08:00 PM' },
    { start: '20:30', end: '21:00', label: '08:30 PM' }
  ];

  // Seed slots for the next 7 days (including today)
  for (let i = 0; i < 7; i++) {
    const slotDate = new Date();
    slotDate.setDate(today.getDate() + i);
    // Set hours to midnight to standardize date comparison
    slotDate.setHours(0, 0, 0, 0);

    for (const ts of timeSlots) {
      await prisma.availabilitySlot.create({
        data: {
          doctorId: doctorProfileId,
          date: slotDate,
          startTime: ts.start,
          endTime: ts.end,
          isBooked: false
        }
      });
    }
  }

  // 5. Create Past Completed Appointments with Reviews (Testimonials)
  console.log('Creating past completed appointments and feedback...');
  const reviews = [
    {
      patient: patients[0], // Rahul Verma
      rating: 5,
      comment: 'Excellent virtual consultation! Dr. Priyadarshi was extremely patient and analyzed my insomnia triggers step-by-step. I slept much better following his guidelines.',
      symptoms: 'Difficulty falling asleep, panic attacks in morning and severe mood changes.',
      dateOffset: -6,
      slotTime: '06:00 PM',
      bookingId: 'NH-293108'
    },
    {
      patient: patients[1], // Priya Sen
      rating: 5,
      comment: 'Highly recommended. His advice for managing work-related anxiety and panic attacks was extremely structured and effective. Very empathetic doctor.',
      symptoms: 'Chronic anxiety, chest tightness, palpitations under work stress.',
      dateOffset: -10,
      slotTime: '05:30 PM',
      bookingId: 'NH-123405'
    },
    {
      patient: patients[2], // Amit Singh
      rating: 4,
      comment: 'Consulted online for stress-induced tension headaches. The diagnosis was precise, and he suggested quick postural changes that helped reduce the strain.',
      symptoms: 'Stress-induced tension headaches, neck strain.',
      dateOffset: -22,
      slotTime: '07:00 PM',
      bookingId: 'NH-309123'
    },
    {
      patient: patients[3], // Meera Nair
      rating: 5,
      comment: 'Superb experience. The Razorpay process was very smooth, and the video quality was crystal clear. The digital prescription was generated instantly.',
      symptoms: 'Panic attacks, situational anxiety.',
      dateOffset: -28,
      slotTime: '08:00 PM',
      bookingId: 'NH-402910'
    }
  ];

  for (const rev of reviews) {
    const apptDate = new Date();
    apptDate.setDate(today.getDate() + rev.dateOffset);
    apptDate.setHours(0, 0, 0, 0);

    // Create a booked availability slot for this past appointment
    const pastSlot = await prisma.availabilitySlot.create({
      data: {
        doctorId: doctorProfileId,
        date: apptDate,
        startTime: rev.slotTime === '05:30 PM' ? '17:30' : rev.slotTime === '06:00 PM' ? '18:00' : rev.slotTime === '07:00 PM' ? '19:00' : '20:00',
        endTime: rev.slotTime === '05:30 PM' ? '18:00' : rev.slotTime === '06:00 PM' ? '18:30' : rev.slotTime === '07:00 PM' ? '19:30' : '20:30',
        isBooked: true
      }
    });

    const appointment = await prisma.appointment.create({
      data: {
        bookingId: rev.bookingId,
        patientId: rev.patient.id,
        doctorId: doctorProfileId,
        slotId: pastSlot.id,
        appointmentDate: apptDate,
        slotTime: rev.slotTime,
        patientName: rev.patient.name,
        patientAge: 30, // mock age
        patientEmail: rev.patient.email,
        patientPhone: rev.patient.phone,
        symptoms: rev.symptoms,
        status: 'COMPLETED',
        videoRoomId: `room-${rev.bookingId.toLowerCase()}`,
        payment: {
          create: {
            razorpayOrderId: `order_mock_${rev.bookingId}`,
            razorpayPaymentId: `pay_mock_${rev.bookingId}`,
            razorpaySignature: `sig_mock_${rev.bookingId}`,
            amount: 700.00,
            status: 'CAPTURED'
          }
        },
        prescription: {
          create: {
            diagnosis: rev.symptoms.includes('headache') ? 'Cervicogenic Headache with General Stress Syndrome' : 'General Anxiety Disorder with Insomnia',
            medications: [
              { name: 'Tab. Paracetamol', dosage: '650mg', freq: '1-0-1 (after meals)' },
              { name: 'Cap. Pregabalin', dosage: '75mg', freq: '0-0-1 (bedtime)' }
            ],
            advice: 'Practice progressive muscle relaxation, avoid screen triggers 1 hour before sleeping, and follow up in 2 weeks.'
          }
        },
        feedback: {
          create: {
            patientId: rev.patient.id,
            rating: rev.rating,
            comment: rev.comment
          }
        }
      }
    });

    console.log(`Seeded past completed appointment and review for: ${rev.patient.name}`);
  }

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
