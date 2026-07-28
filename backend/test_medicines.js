import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:5000/api/v1';

async function runMedicinesTests() {
  console.log('=== NEURO HARMONY MEDICINE DATABASE INTEGRATION TEST ===\n');

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

    // 2. Add a new medicine (WITHOUT DOSAGE - testing optional dosage!)
    console.log('\n[Test 2] Adding new medicine "Sertraline" (WITHOUT dosage) to master list...');
    const payload = {
      name: 'Sertraline'
    };

    const addRes = await fetch(`${BASE_URL}/doctor/medicines`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const addData = await addRes.json();
    console.log('Add response status:', addRes.status);
    console.log('Add response success:', addData.success);
    console.log('Add response medicine dosage:', addData.medicine.dosage);
    if (!addData.success) {
      console.error('Add medicine failed:', addData);
      return;
    }

    const createdId = addData.medicine.id;
    console.log('Added Medicine ID:', createdId);

    // 3. Edit spelling/name & add dosage via PUT API /doctor/medicines/:id
    console.log('\n[Test 3] Editing spelling of "Sertraline" to "Sertraline Hydrochloride" and setting dosage via PUT...');
    const putRes = await fetch(`${BASE_URL}/doctor/medicines/${createdId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: 'Sertraline Hydrochloride',
        dosage: '50mg'
      })
    });

    const putData = await putRes.json();
    console.log('PUT response status:', putRes.status);
    console.log('PUT response medicine name:', putData.medicine.name);
    console.log('PUT response medicine dosage:', putData.medicine.dosage);
    if (putData.success && putData.medicine.name === 'Sertraline Hydrochloride' && putData.medicine.dosage === '50mg') {
      console.log('Spelling & dosage edit PUT test verified successfully.');
    } else {
      console.error('Spelling & dosage edit PUT test failed:', putData);
      return;
    }

    // 4. Get all medicines
    console.log('\n[Test 4] Fetching medicine database list via GET /doctor/medicines...');
    const listRes = await fetch(`${BASE_URL}/doctor/medicines`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const listData = await listRes.json();
    console.log('List response status:', listRes.status);
    console.log('Total medicines in DB:', listData.medicines.length);
    const foundMed = listData.medicines.find(m => m.id === createdId);
    if (foundMed) {
      console.log(`Successfully found preconfigured medicine "${foundMed.name}" in list!`);
    } else {
      console.error('Preconfigured medicine not found in database list!');
      return;
    }

    // 5. Delete the medicine
    console.log('\n[Test 5] Deleting preconfigured medicine from database...');
    const deleteRes = await fetch(`${BASE_URL}/doctor/medicines/${createdId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const deleteData = await deleteRes.json();
    console.log('Delete response status:', deleteRes.status);
    console.log('Delete response message:', deleteData.message);

    // Verify it is gone
    const verifyRes = await fetch(`${BASE_URL}/doctor/medicines`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const verifyData = await verifyRes.json();
    const stillExists = verifyData.medicines.some(m => m.id === createdId);
    if (!stillExists) {
      console.log('Deletion confirmed. Medicine no longer exists in DB.');
    } else {
      console.error('Error: Deleted medicine still exists in DB!');
      return;
    }

    console.log('\n=== INTEGRATION TEST COMPLETED SUCCESSFULLY ===');

  } catch (error) {
    console.error('Integration test failed with error:', error);
  }
}

runMedicinesTests();
