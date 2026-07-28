import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:5000/api/v1';

async function runOfflineRxTests() {
  console.log('=== NEURO HARMONY OFFLINE PRESCRIPTION INTEGRATION TEST ===\n');

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
      return;
    }
    const token = loginData.token;
    console.log('Doctor logged in successfully.');

    // 2. Create an Offline Prescription
    console.log('\n[Test 2] Creating an offline prescription via POST /doctor/offline-prescriptions...');
    const payload = {
      patientName: 'Offline Test Patient',
      patientAge: 45,
      patientGender: 'Male',
      diagnosis: 'Chronic tension-type headache with secondary insomnia',
      medications: [
        { name: 'Amitriptyline 10mg', dosage: '1 tab', frequency: 'At bedtime' },
        { name: 'Paracetamol 650mg', dosage: '1 tab', frequency: 'As needed for pain' },
        { name: 'Propranolol 40mg', dosage: '1 tab', frequency: 'Twice daily' },
        { name: 'Melatonin 3mg', dosage: '1 tab', frequency: 'Nightly' },
        { name: 'Pantoprazole 40mg', dosage: '1 tab', frequency: 'Morning before food' },
        { name: 'Multivitamin', dosage: '1 cap', frequency: 'Daily after lunch' },
        { name: 'Clonazepam 0.25mg', dosage: '0.5 tab', frequency: 'SOS for severe anxiety' }
      ],
      advice: 'Avoid alcohol. Practice cognitive behavioral therapy (CBT) for insomnia. Follow up in 3 weeks.',
      pageWidth: 820,
      pageHeight: 1150,
      fontSize: 14,
      marginSize: 45,
      rowSpacing: 14
    };

    const createRes = await fetch(`${BASE_URL}/doctor/offline-prescriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const createData = await createRes.json();
    console.log('Create response status:', createRes.status);
    console.log('Create response success:', createData.success);
    if (!createData.success) {
      console.error('Create prescription failed:', createData);
      return;
    }

    const createdId = createData.prescription.id;
    console.log('Created Offline Prescription ID:', createdId);

    // 3. Get all offline prescriptions
    console.log('\n[Test 3] Listing offline prescriptions via GET /doctor/offline-prescriptions...');
    const listRes = await fetch(`${BASE_URL}/doctor/offline-prescriptions`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const listData = await listRes.json();
    console.log('List response status:', listRes.status);
    console.log('Total offline prescriptions found:', listData.prescriptions.length);
    const foundRx = listData.prescriptions.find(rx => rx.id === createdId);
    if (foundRx) {
      console.log('Successfully found the created prescription in list!');
      console.log(`Saved margins: ${foundRx.marginSize}px, rowSpacing: ${foundRx.rowSpacing}px`);
    } else {
      console.error('Created prescription not found in list!');
      return;
    }

    // 4. Update the Offline Prescription
    console.log('\n[Test 4] Updating layout settings for the offline prescription...');
    const updatePayload = {
      id: createdId,
      ...payload,
      pageHeight: 1200,
      fontSize: 12 // scale down font size to fit medications better
    };

    const updateRes = await fetch(`${BASE_URL}/doctor/offline-prescriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(updatePayload)
    });

    const updateData = await updateRes.json();
    console.log('Update response status:', updateRes.status);
    console.log('Update response success:', updateData.success);
    if (updateData.success && updateData.prescription.fontSize === 12) {
      console.log('Prescription layout updated correctly.');
    } else {
      console.error('Failed to update prescription layout:', updateData);
    }

    // 5. Delete the Offline Prescription
    console.log('\n[Test 5] Deleting the offline prescription...');
    const deleteRes = await fetch(`${BASE_URL}/doctor/offline-prescriptions/${createdId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const deleteData = await deleteRes.json();
    console.log('Delete response status:', deleteRes.status);
    console.log('Delete response message:', deleteData.message);

    console.log('\n=== INTEGRATION TEST COMPLETED SUCCESSFULLY ===');

  } catch (error) {
    console.error('Integration test failed with error:', error);
  }
}

runOfflineRxTests();
