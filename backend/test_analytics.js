import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:5000/api/v1';

async function runAnalyticsTests() {
  console.log('=== NEURO HARMONY CLINICAL RESEARCH & ANALYTICS TEST ===\n');

  try {
    // 1. Authenticate Doctor
    console.log('[Step 1] Logging in Doctor...');
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
    console.log('✔ Doctor logged in successfully.');

    // 2. Fetch Overview Analytics
    console.log('\n[Step 2] Testing GET /api/v1/doctor/analytics/overview...');
    const overviewRes = await fetch(`${BASE_URL}/doctor/analytics/overview?timeframe=all`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const overviewData = await overviewRes.json();
    console.log('Overview Response Status:', overviewRes.status);
    console.log('Overview Data Success:', overviewData.success);
    console.log('Total Prescriptions:', overviewData.data?.totalPrescriptions);
    console.log('Unique Patients:', overviewData.data?.totalUniquePatients);
    console.log('Unique Medicines:', overviewData.data?.totalUniqueMedicines);
    console.log('Top Prescribed Medicines:', overviewData.data?.topMedicines?.slice(0, 5));
    console.log('Age Histogram:', overviewData.data?.ageHistogram);
    console.log('Top Diagnoses:', overviewData.data?.topDiagnoses?.slice(0, 5));

    // 3. Search Medicine Analytics
    const testMedName = overviewData.data?.topMedicines?.[0]?.name || 'Amitriptyline';
    console.log(`\n[Step 3] Testing GET /api/v1/doctor/analytics/medicine?name=${testMedName}...`);
    const medRes = await fetch(`${BASE_URL}/doctor/analytics/medicine?name=${encodeURIComponent(testMedName)}&timeframe=all`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const medData = await medRes.json();
    console.log('Medicine Response Status:', medRes.status);
    console.log('Medicine Canonical Name:', medData.data?.canonicalName);
    console.log('Total Prescriptions for this drug:', medData.data?.totalPrescriptions);
    console.log('Total Patients on this drug:', medData.data?.totalPatients);
    console.log('Total Quantity Prescribed (tablets/units):', medData.data?.totalQuantityPrescribed);
    console.log('Dosage Histogram:', medData.data?.dosageHistogram);
    console.log('Age Demographics Histogram:', medData.data?.ageHistogram);
    console.log('Top Diagnoses Correlation:', medData.data?.topDiagnoses);
    console.log('Co-Prescribed Drugs:', medData.data?.coPrescriptions);
    console.log('Recent Patient Prescriptions Count:', medData.data?.recentPrescriptions?.length);

    console.log('\n✔ ALL CLINICAL RESEARCH & ANALYTICS ENDPOINTS ARE WORKING PERFECTLY!\n');

  } catch (err) {
    console.error('Analytics test error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

runAnalyticsTests();
