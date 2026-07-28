import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:5000/api/v1';

async function testMultiBooking() {
  console.log('=== TESTING MULTI-USER BOOKING FOR SAME TIME SLOT ===\n');

  try {
    const doctor = await prisma.doctorProfile.findFirst();
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    // 1. Fetch available slots for today
    const availRes = await fetch(`${BASE_URL}/doctors/${doctor.id}/availability?date=${dateStr}`);
    const availData = await availRes.json();
    console.log(`Available slots for ${dateStr}:`, availData.slots.map(s => `${s.startTime} (${s.label})`));

    const targetSlot = availData.slots[0]; // e.g. 17:00 (05:00 PM)
    console.log(`\nSelected target slot: ${targetSlot.startTime} (${targetSlot.label}), Slot ID: ${targetSlot.id}`);

    // Create 2 distinct test patients
    const patientA = await prisma.user.upsert({
      where: { phone: '9111111111' },
      update: {},
      create: { name: 'Patient Alice', phone: '9111111111', email: 'alice@example.com', role: 'PATIENT' }
    });

    const patientB = await prisma.user.upsert({
      where: { phone: '9222222222' },
      update: {},
      create: { name: 'Patient Bob', phone: '9222222222', email: 'bob@example.com', role: 'PATIENT' }
    });

    // Create mock JWT tokens for both patients
    const jwt = (await import('jsonwebtoken')).default;
    const secret = process.env.JWT_ACCESS_SECRET || 'jwt_access_secret_neuro_harmony';
    const tokenA = jwt.sign({ phone: patientA.phone, role: 'PATIENT', scope: 'complete_booking' }, secret, { expiresIn: '1h' });
    const tokenB = jwt.sign({ phone: patientB.phone, role: 'PATIENT', scope: 'complete_booking' }, secret, { expiresIn: '1h' });

    // 2. Patient A books the slot
    console.log('\n[Booking 1] Patient Alice booking slot...');
    const bookResA = await fetch(`${BASE_URL}/appointments/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({
        slotId: targetSlot.id,
        patientName: patientA.name,
        patientAge: 28,
        patientEmail: patientA.email,
        patientPhone: patientA.phone,
        symptoms: 'Anxiety and insomnia.'
      })
    });
    const bookDataA = await bookResA.json();
    console.log('Patient Alice booking response:', bookResA.status, bookDataA.bookingId);

    // 3. Patient B books the SAME slot
    console.log('\n[Booking 2] Patient Bob booking the SAME slot...');
    const bookResB = await fetch(`${BASE_URL}/appointments/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenB}` },
      body: JSON.stringify({
        slotId: targetSlot.id,
        patientName: patientB.name,
        patientAge: 34,
        patientEmail: patientB.email,
        patientPhone: patientB.phone,
        symptoms: 'Tension headaches.'
      })
    });
    const bookDataB = await bookResB.json();
    console.log('Patient Bob booking response:', bookResB.status, bookDataB.bookingId);

    if (bookResA.status === 201 && bookResB.status === 201) {
      console.log('\n[SUCCESS] Both patients successfully booked the same time slot!');
    } else {
      console.error('\n[FAILURE] Multi-booking failed.');
    }

  } catch (err) {
    console.error('Test error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

testMultiBooking();
