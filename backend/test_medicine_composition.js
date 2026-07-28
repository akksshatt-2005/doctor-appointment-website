import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:5000/api/v1';

async function runCompositionTests() {
  console.log('=== NEURO HARMONY MEDICINE COMPOSITION INTEGRATION TEST ===\n');

  try {
    // 1. Authenticate Doctor (email/password login)
    console.log('[Test 1] Logging in Doctor...');
    const loginRes = await fetch(`${BASE_URL}/auth/doctor/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'doctor@neuroharmony.in',
        password: 'doctor123'
      })
    });

    const loginData = await loginRes.json();
    if (!loginData.success) {
      console.error('Doctor login failed:', loginData);
      process.exit(1);
    }
    const token = loginData.token;
    console.log('Doctor logged in successfully.');

    // 2. Add a new medicine WITH COMPOSITION
    console.log('\n[Test 2] Adding new medicine "Dolo 650" with composition "Paracetamol 650mg" and default dosage "1 tab"...');
    const addRes = await fetch(`${BASE_URL}/doctor/medicines`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: 'Dolo 650',
        composition: 'Paracetamol 650mg',
        dosage: '1 tab'
      })
    });

    const addData = await addRes.json();
    console.log('Add response status:', addRes.status);
    console.log('Add response success:', addData.success);
    if (!addData.success) {
      console.error('Add medicine failed:', addData);
      process.exit(1);
    }

    const createdId = addData.medicine.id;
    console.log('Added Medicine ID:', createdId);
    console.log('Added Medicine Composition:', addData.medicine.composition);
    if (addData.medicine.composition === 'Paracetamol 650mg') {
      console.log('✔ Add medicine composition verified.');
    } else {
      console.error('❌ Add medicine composition mismatch:', addData.medicine.composition);
      process.exit(1);
    }

    // 3. Edit composition via PUT API /doctor/medicines/:id
    console.log('\n[Test 3] Editing composition of "Dolo 650" via PUT...');
    const putRes = await fetch(`${BASE_URL}/doctor/medicines/${createdId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: 'Dolo 650 Brand',
        composition: 'Acetaminophen 650mg USP',
        dosage: '1 tablet'
      })
    });

    const putData = await putRes.json();
    console.log('PUT response status:', putRes.status);
    console.log('PUT response medicine composition:', putData.medicine.composition);
    if (putData.success && putData.medicine.composition === 'Acetaminophen 650mg USP') {
      console.log('✔ Edit medicine composition PUT test verified successfully.');
    } else {
      console.error('❌ Edit medicine composition PUT test failed:', putData);
      process.exit(1);
    }

    // 4. Create an Offline Prescription with medications containing composition
    console.log('\n[Test 4] Creating an offline prescription with composition...');
    const rxPayload = {
      patientName: 'Composition Test Patient',
      patientAge: 32,
      patientGender: 'Female',
      patientPhone: '9876543210',
      referenceId: 'REF-TEST-COMP-101',
      diagnosis: 'Fever',
      medications: [
        { name: 'Dolo 650 Brand', composition: 'Acetaminophen 650mg USP', dosage: '1 tablet', frequency: 'Three times daily after meals' }
      ],
      advice: 'Drink warm water.',
      pageWidth: 800,
      pageHeight: 1120,
      fontSize: 13,
      marginSize: 40,
      rowSpacing: 12
    };

    const createRxRes = await fetch(`${BASE_URL}/doctor/offline-prescriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(rxPayload)
    });

    const createRxData = await createRxRes.json();
    console.log('Create Rx status:', createRxRes.status);
    console.log('Create Rx success:', createRxData.success);
    if (!createRxData.success) {
      console.error('Create offline prescription failed:', createRxData);
      process.exit(1);
    }

    const createdRxId = createRxData.prescription.id;
    console.log('Created Offline Rx ID:', createdRxId);

    // 5. Fetch all offline prescriptions and verify composition inside the JSON medications field
    console.log('\n[Test 5] Fetching offline prescription list and verifying composition details...');
    const listRxRes = await fetch(`${BASE_URL}/doctor/offline-prescriptions`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const listRxData = await listRxRes.json();
    const foundRx = listRxData.prescriptions.find(rx => rx.id === createdRxId);
    if (!foundRx) {
      console.error('Created offline prescription not found in list!');
      process.exit(1);
    }

    const meds = typeof foundRx.medications === 'string' ? JSON.parse(foundRx.medications) : foundRx.medications;
    console.log('Saved medications list:', meds);
    if (meds && meds[0] && meds[0].composition === 'Acetaminophen 650mg USP') {
      console.log('✔ Offline prescription medications composition verified successfully.');
    } else {
      console.error('❌ Offline prescription medications composition mismatch:', meds);
      process.exit(1);
    }

    // Clean up test items
    console.log('\n[Cleanup] Deleting test medicine and offline prescription...');
    await fetch(`${BASE_URL}/doctor/medicines/${createdId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    await fetch(`${BASE_URL}/doctor/offline-prescriptions/${createdRxId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('Test items cleaned up successfully.');
    console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===');

  } catch (error) {
    console.error('An error occurred during test execution:', error);
    process.exit(1);
  }
}

runCompositionTests();
