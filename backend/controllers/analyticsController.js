import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Helper to normalize medicine names for matching and grouping
function normalizeMedName(name) {
  if (!name) return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Helper to extract numeric quantity or compute approximate quantity from frequency & duration
function estimateQuantity(med) {
  if (med.quantity && !isNaN(Number(med.quantity))) {
    return Number(med.quantity);
  }

  // Parse frequency e.g. "1-0-1" -> 2 per day, "1-1-1" -> 3 per day, "0-0-1" -> 1 per day, "OD" -> 1, "BD" -> 2, "TDS" -> 3
  let dailyDoses = 1;
  const freqStr = (med.frequency || med.freq || '').toString().toLowerCase();

  if (freqStr.includes('1-1-1') || freqStr.includes('tds') || freqStr.includes('tid')) {
    dailyDoses = 3;
  } else if (freqStr.includes('1-0-1') || freqStr.includes('bd') || freqStr.includes('bid')) {
    dailyDoses = 2;
  } else if (freqStr.includes('1-1-0') || freqStr.includes('0-1-1')) {
    dailyDoses = 2;
  } else if (freqStr.includes('0-0-1') || freqStr.includes('1-0-0') || freqStr.includes('od') || freqStr.includes('hs')) {
    dailyDoses = 1;
  } else if (freqStr.includes('sos') || freqStr.includes('prn')) {
    dailyDoses = 0.5;
  }

  // Parse duration e.g. "15 days", "1 month", "30 days"
  let days = 15; // default 15-day course if unspecified
  const durationStr = (med.duration || med.advice || '').toString().toLowerCase();
  const matchDays = durationStr.match(/(\d+)\s*(day|days|d)/);
  const matchWeeks = durationStr.match(/(\d+)\s*(week|weeks|w)/);
  const matchMonths = durationStr.match(/(\d+)\s*(month|months|m)/);

  if (matchDays) {
    days = parseInt(matchDays[1], 10);
  } else if (matchWeeks) {
    days = parseInt(matchWeeks[1], 10) * 7;
  } else if (matchMonths) {
    days = parseInt(matchMonths[1], 10) * 30;
  }

  return Math.max(1, Math.round(dailyDoses * days));
}

// Helper to filter prescriptions by timeframe
function getDateFilter(timeframe) {
  if (!timeframe || timeframe === 'all') return null;
  const now = new Date();
  if (timeframe === '30days') {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  if (timeframe === '90days') {
    return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  }
  if (timeframe === '1year') {
    return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  }
  return null;
}

/**
 * GET /api/v1/doctor/analytics/overview
 * Global analytics: Total prescriptions, top medicines, top diagnoses, age/gender distributions, and volume trends.
 */
export async function getPrescriptionOverview(req, res, next) {
  try {
    const doctorProfile = await prisma.doctorProfile.findUnique({
      where: { userId: req.user.id }
    });

    if (!doctorProfile) {
      return res.status(404).json({
        success: false,
        message: 'Doctor profile not found.'
      });
    }

    const { timeframe } = req.query;
    const dateLimit = getDateFilter(timeframe);

    // Fetch offline prescriptions
    const offlineWhere = { doctorId: doctorProfile.id };
    if (dateLimit) {
      offlineWhere.createdAt = { gte: dateLimit };
    }
    const offlineRxs = await prisma.offlinePrescription.findMany({
      where: offlineWhere,
      orderBy: { createdAt: 'desc' }
    });

    // Fetch online appointments & prescriptions
    const onlineWhere = { doctorId: doctorProfile.id };
    if (dateLimit) {
      onlineWhere.createdAt = { gte: dateLimit };
    }
    const onlineAppts = await prisma.appointment.findMany({
      where: {
        ...onlineWhere,
        prescription: { isNot: null }
      },
      include: {
        prescription: true,
        patient: true
      },
      orderBy: { createdAt: 'desc' }
    });

    // Aggregators
    const medUsageMap = new Map(); // normalizedName -> { displayName, count, totalQuantity, uniquePatients: Set }
    const diagnosisMap = new Map(); // diagnosis -> count
    const ageBins = { '<18': 0, '18-30': 0, '31-45': 0, '46-60': 0, '60+': 0 };
    const genderMap = { Male: 0, Female: 0, Other: 0 };
    const monthlyTrendMap = new Map(); // "YYYY-MM" -> count
    const uniquePatientKeys = new Set();

    function processPrescriptionRecord(rx, isOnline = false) {
      const pName = isOnline ? rx.patientName : rx.patientName;
      const pPhone = isOnline ? (rx.patientPhone || rx.patient?.phone) : (rx.patientPhone || '');
      const pAge = isOnline ? rx.patientAge : rx.patientAge;
      const pGender = isOnline ? 'Not Specified' : (rx.patientGender || 'Not Specified');
      const diagnosis = rx.diagnosis || (isOnline ? rx.prescription?.diagnosis : '') || 'Unspecified';
      const createdAt = rx.createdAt ? new Date(rx.createdAt) : new Date();

      // Unique patient tracking
      const patientKey = pPhone ? pPhone : `${pName}_${pAge}`;
      uniquePatientKeys.add(patientKey);

      // Age Bins
      if (pAge) {
        if (pAge < 18) ageBins['<18']++;
        else if (pAge <= 30) ageBins['18-30']++;
        else if (pAge <= 45) ageBins['31-45']++;
        else if (pAge <= 60) ageBins['46-60']++;
        else ageBins['60+']++;
      }

      // Gender
      if (pGender.toLowerCase().startsWith('m')) genderMap.Male++;
      else if (pGender.toLowerCase().startsWith('f')) genderMap.Female++;
      else genderMap.Other++;

      // Diagnosis
      if (diagnosis) {
        const diagClean = diagnosis.trim();
        diagnosisMap.set(diagClean, (diagnosisMap.get(diagClean) || 0) + 1);
      }

      // Monthly Trend
      const monthKey = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`;
      monthlyTrendMap.set(monthKey, (monthlyTrendMap.get(monthKey) || 0) + 1);

      // Parse Medications list
      let rawMeds = isOnline ? rx.prescription?.medications : rx.medications;
      if (typeof rawMeds === 'string') {
        try { rawMeds = JSON.parse(rawMeds); } catch (e) { rawMeds = []; }
      }
      if (Array.isArray(rawMeds)) {
        for (const m of rawMeds) {
          if (!m.name) continue;
          const norm = normalizeMedName(m.name);
          const qty = estimateQuantity(m);

          if (!medUsageMap.has(norm)) {
            medUsageMap.set(norm, {
              displayName: m.name.trim(),
              count: 0,
              totalQuantity: 0,
              composition: m.composition || '',
              patients: new Set()
            });
          }
          const item = medUsageMap.get(norm);
          item.count++;
          item.totalQuantity += qty;
          item.patients.add(patientKey);
          if (m.composition && !item.composition) {
            item.composition = m.composition;
          }
        }
      }
    }

    offlineRxs.forEach(rx => processPrescriptionRecord(rx, false));
    onlineAppts.forEach(appt => processPrescriptionRecord(appt, true));

    // Top 10 Prescribed Medicines
    const topMedicines = Array.from(medUsageMap.values())
      .map(item => ({
        name: item.displayName,
        composition: item.composition,
        prescriptionCount: item.count,
        totalQuantity: item.totalQuantity,
        patientCount: item.patients.size
      }))
      .sort((a, b) => b.prescriptionCount - a.prescriptionCount)
      .slice(0, 12);

    // Top Diagnoses
    const totalRxCount = offlineRxs.length + onlineAppts.length;
    const topDiagnoses = Array.from(diagnosisMap.entries())
      .map(([name, count]) => ({
        name,
        count,
        percentage: totalRxCount > 0 ? Math.round((count / totalRxCount) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // Age Histogram formatted array
    const ageHistogram = Object.entries(ageBins).map(([range, count]) => ({
      range,
      count,
      percentage: totalRxCount > 0 ? Math.round((count / totalRxCount) * 100) : 0
    }));

    // Monthly Trends sorted chronologically
    const sortedMonths = Array.from(monthlyTrendMap.keys()).sort();
    const monthlyTrends = sortedMonths.map(month => ({
      month,
      count: monthlyTrendMap.get(month)
    }));

    return res.status(200).json({
      success: true,
      data: {
        totalPrescriptions: totalRxCount,
        offlineCount: offlineRxs.length,
        onlineCount: onlineAppts.length,
        totalUniquePatients: uniquePatientKeys.size,
        totalUniqueMedicines: medUsageMap.size,
        topMedicines,
        topDiagnoses,
        ageHistogram,
        genderDistribution: genderMap,
        monthlyTrends
      }
    });

  } catch (error) {
    console.error('Analytics overview error:', error);
    next(error);
  }
}

// Helper to split a composition string into its individual active ingredients
function splitCompositionIngredients(compStr) {
  if (!compStr) return [];
  return compStr
    .split(/\s*(?:\+|\/|&|\bwith\b|\band\b)\s*/i)
    .map(s => s.trim())
    .filter(Boolean);
}

// Helper to clean an ingredient name for comparison (stripping dosage numbers, units, IP/USP, and whitespace)
function cleanIngredientForMatch(ing) {
  if (!ing) return '';
  return ing
    .toLowerCase()
    .replace(/\b\d+(\.\d+)?\s*(mg|mcg|g|ml|iu|%)\b/gi, '')
    .replace(/\b(ip|usp|bp|sr|er|cr|pr|dt|tab|cap|tablets|capsules|syrup)\b/gi, '')
    .replace(/[(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Check if a medicine's composition strictly matches the searched composition.
// Strict rule: If user searches for a composition (e.g. "Clonazepam"), combination drugs containing
// that composition + another composition (e.g. "Clonazepam + Escitalopram") are EXCLUDED.
function matchExactComposition(medComp, searchComp) {
  if (!medComp || !searchComp) return false;

  const medIngs = splitCompositionIngredients(medComp);
  const searchIngs = splitCompositionIngredients(searchComp);

  if (medIngs.length === 0 || searchIngs.length === 0) return false;

  // Exact number of active components must match
  if (medIngs.length !== searchIngs.length) {
    return false;
  }

  const cleanMedIngs = medIngs.map(cleanIngredientForMatch).filter(Boolean);
  const cleanSearchIngs = searchIngs.map(cleanIngredientForMatch).filter(Boolean);

  if (cleanMedIngs.length !== cleanSearchIngs.length) {
    return false;
  }

  const matched = new Set();
  for (const s of cleanSearchIngs) {
    let foundIdx = -1;
    for (let i = 0; i < cleanMedIngs.length; i++) {
      if (matched.has(i)) continue;
      const m = cleanMedIngs[i];
      if (m === s || m.includes(s) || s.includes(m)) {
        foundIdx = i;
        break;
      }
    }
    if (foundIdx === -1) {
      return false;
    }
    matched.add(foundIdx);
  }

  return true;
}

/**
 * GET /api/v1/doctor/analytics/medicine?name=... or ?composition=...
 * Deep-dive research analytics by active composition.
 */
export async function getMedicineAnalytics(req, res, next) {
  try {
    const doctorProfile = await prisma.doctorProfile.findUnique({
      where: { userId: req.user.id }
    });

    if (!doctorProfile) {
      return res.status(404).json({
        success: false,
        message: 'Doctor profile not found.'
      });
    }

    const { name, composition, timeframe } = req.query;
    const targetComp = (composition || name || '').trim();
    if (!targetComp) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a composition to search.'
      });
    }

    const dateLimit = getDateFilter(timeframe);

    // Fetch doctor's medicine catalog to resolve compositions for medicines missing composition in older rx records
    const doctorMeds = await prisma.medicine.findMany({
      where: { doctorId: doctorProfile.id }
    });
    const medCatalogMap = new Map();
    doctorMeds.forEach(m => {
      if (m.name && m.composition) {
        medCatalogMap.set(normalizeMedName(m.name), m.composition.trim());
      }
    });

    // Fetch offline prescriptions
    const offlineWhere = { doctorId: doctorProfile.id };
    if (dateLimit) {
      offlineWhere.createdAt = { gte: dateLimit };
    }
    const offlineRxs = await prisma.offlinePrescription.findMany({
      where: offlineWhere,
      orderBy: { createdAt: 'desc' }
    });

    // Fetch online appointments with prescriptions
    const onlineWhere = { doctorId: doctorProfile.id };
    if (dateLimit) {
      onlineWhere.createdAt = { gte: dateLimit };
    }
    const onlineAppts = await prisma.appointment.findMany({
      where: {
        ...onlineWhere,
        prescription: { isNot: null }
      },
      include: {
        prescription: true,
        patient: true
      },
      orderBy: { createdAt: 'desc' }
    });

    // Deep-dive accumulators
    let totalOccurrences = 0;
    let totalQuantity = 0;
    const matchedPatients = new Set();
    const dosageDistribution = new Map(); // "50 mg" -> count
    const frequencyDistribution = new Map(); // "1-0-1" -> count
    const diagnosisDistribution = new Map(); // diagnosis -> count
    const coPrescribedMap = new Map(); // other medicine name -> count
    const brandMap = new Map(); // brand name -> count
    const ageBins = { '<18': 0, '18-30': 0, '31-45': 0, '46-60': 0, '60+': 0 };
    const genderMap = { Male: 0, Female: 0, Other: 0 };
    const matchingRecords = [];
    let canonicalComposition = targetComp;
    let canonicalName = '';

    function checkAndProcessRecord(rx, isOnline = false) {
      let rawMeds = isOnline ? rx.prescription?.medications : rx.medications;
      if (typeof rawMeds === 'string') {
        try { rawMeds = JSON.parse(rawMeds); } catch (e) { rawMeds = []; }
      }
      if (!Array.isArray(rawMeds)) return;

      // Find all medications in this prescription that match the searched composition
      const matchingMedsInRx = rawMeds.filter(m => {
        if (!m) return false;
        const comp = (m.composition && m.composition.trim()) || (m.name && medCatalogMap.get(normalizeMedName(m.name))) || '';
        return matchExactComposition(comp, targetComp);
      });

      if (matchingMedsInRx.length === 0) return;

      matchingMedsInRx.forEach(foundMed => {
        const medBrandName = foundMed.name ? foundMed.name.trim() : 'Generic';
        brandMap.set(medBrandName, (brandMap.get(medBrandName) || 0) + 1);

        if (!canonicalName) canonicalName = medBrandName;
        if (foundMed.composition && (!canonicalComposition || canonicalComposition === targetComp)) {
          canonicalComposition = foundMed.composition;
        }

        totalOccurrences++;
        const qty = estimateQuantity(foundMed);
        totalQuantity += qty;

        const pName = rx.patientName || (isOnline ? rx.patient?.fullName : '');
        const pPhone = rx.patientPhone || (isOnline ? rx.patient?.phone : '') || '';
        const pAge = rx.patientAge || (isOnline ? rx.patient?.age : '');
        const pGender = isOnline ? 'Not Specified' : (rx.patientGender || 'Not Specified');
        const diagnosis = rx.diagnosis || (isOnline ? rx.prescription?.diagnosis : '') || 'Unspecified';
        const createdAt = rx.createdAt ? new Date(rx.createdAt) : new Date();

        const patientKey = pPhone ? pPhone : `${pName}_${pAge}`;
        matchedPatients.add(patientKey);

        // Dosage distribution
        const dosageStr = (foundMed.dosage || 'Standard').trim();
        dosageDistribution.set(dosageStr, (dosageDistribution.get(dosageStr) || 0) + 1);

        // Frequency distribution
        const freqStr = (foundMed.frequency || foundMed.freq || 'Standard').trim();
        frequencyDistribution.set(freqStr, (frequencyDistribution.get(freqStr) || 0) + 1);

        // Diagnosis distribution
        if (diagnosis) {
          const diagClean = diagnosis.trim();
          diagnosisDistribution.set(diagClean, (diagnosisDistribution.get(diagClean) || 0) + 1);
        }

        // Age Bins
        if (pAge) {
          const ageNum = Number(pAge);
          if (ageNum < 18) ageBins['<18']++;
          else if (ageNum <= 30) ageBins['18-30']++;
          else if (ageNum <= 45) ageBins['31-45']++;
          else if (ageNum <= 60) ageBins['46-60']++;
          else ageBins['60+']++;
        }

        // Gender
        if (pGender.toLowerCase().startsWith('m')) genderMap.Male++;
        else if (pGender.toLowerCase().startsWith('f')) genderMap.Female++;
        else genderMap.Other++;

        // Co-prescribed companion medicines (excluding the matched medicine)
        rawMeds.forEach(otherMed => {
          if (!otherMed || !otherMed.name) return;
          const otherNorm = normalizeMedName(otherMed.name);
          if (otherNorm !== normalizeMedName(foundMed.name)) {
            const otherDisplay = otherMed.name.trim();
            coPrescribedMap.set(otherDisplay, (coPrescribedMap.get(otherDisplay) || 0) + 1);
          }
        });

        // Sample recent records (up to 15)
        if (matchingRecords.length < 15) {
          matchingRecords.push({
            id: rx.id,
            date: createdAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
            patientName: pName,
            patientAge: pAge,
            patientGender: pGender,
            medicineName: medBrandName,
            composition: foundMed.composition || canonicalComposition,
            diagnosis,
            dosage: foundMed.dosage || '-',
            frequency: foundMed.frequency || foundMed.freq || '-',
            estimatedQty: qty
          });
        }
      });
    }

    offlineRxs.forEach(rx => checkAndProcessRecord(rx, false));
    onlineAppts.forEach(appt => checkAndProcessRecord(appt, true));

    // Brands list
    const brands = Array.from(brandMap.entries())
      .map(([name, count]) => ({
        name,
        count,
        percentage: totalOccurrences > 0 ? Math.round((count / totalOccurrences) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count);

    // Dosage Histogram Array
    const dosageHistogram = Array.from(dosageDistribution.entries())
      .map(([dosage, count]) => ({
        dosage,
        count,
        percentage: totalOccurrences > 0 ? Math.round((count / totalOccurrences) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count);

    // Age Histogram Array
    const ageHistogram = Object.entries(ageBins).map(([range, count]) => ({
      range,
      count,
      percentage: totalOccurrences > 0 ? Math.round((count / totalOccurrences) * 100) : 0
    }));

    // Top Diagnoses for this composition
    const topDiagnoses = Array.from(diagnosisDistribution.entries())
      .map(([diagnosis, count]) => ({
        diagnosis,
        count,
        percentage: totalOccurrences > 0 ? Math.round((count / totalOccurrences) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // Top Co-prescribed Drugs
    const coPrescriptions = Array.from(coPrescribedMap.entries())
      .map(([name, count]) => ({
        name,
        count,
        coOccurrenceRate: totalOccurrences > 0 ? Math.round((count / totalOccurrences) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // Common Frequencies
    const topFrequencies = Array.from(frequencyDistribution.entries())
      .map(([frequency, count]) => ({
        frequency,
        count,
        percentage: totalOccurrences > 0 ? Math.round((count / totalOccurrences) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count);

    return res.status(200).json({
      success: true,
      data: {
        searchedQuery: targetComp,
        canonicalName: canonicalName || targetComp,
        canonicalComposition: canonicalComposition || targetComp,
        brands,
        totalPrescriptions: totalOccurrences,
        totalPatients: matchedPatients.size,
        totalQuantityPrescribed: totalQuantity,
        averageQuantityPerRx: totalOccurrences > 0 ? Math.round(totalQuantity / totalOccurrences) : 0,
        dosageHistogram,
        ageHistogram,
        genderDistribution: genderMap,
        topDiagnoses,
        coPrescriptions,
        topFrequencies,
        recentPrescriptions: matchingRecords
      }
    });

  } catch (error) {
    console.error('Medicine analytics error:', error);
    next(error);
  }
}

/**
 * GET /api/v1/doctor/analytics/patient-volume
 * Practice analytics: Daily & Monthly patient volume with New vs. Follow-up patient tracking,
 * day-of-week heatmaps, retention rate, and time-slot densities.
 */
export async function getPatientVolumeAnalytics(req, res, next) {
  try {
    const doctorProfile = await prisma.doctorProfile.findUnique({
      where: { userId: req.user.id }
    });

    if (!doctorProfile) {
      return res.status(404).json({
        success: false,
        message: 'Doctor profile not found.'
      });
    }

    const { month, year, timeframe } = req.query;

    // 1. Fetch all offline prescriptions
    const offlineRxs = await prisma.offlinePrescription.findMany({
      where: { doctorId: doctorProfile.id },
      orderBy: { createdAt: 'asc' }
    });

    // 2. Fetch all online appointments (with prescription or scheduled/completed)
    const onlineAppts = await prisma.appointment.findMany({
      where: {
        doctorId: doctorProfile.id,
        status: { in: ['COMPLETED', 'SCHEDULED'] }
      },
      include: {
        prescription: true,
        patient: true
      },
      orderBy: { appointmentDate: 'asc' }
    });

    // 3. Unify visits chronologically
    const allVisits = [];

    offlineRxs.forEach(rx => {
      const visitDate = rx.consultDate ? new Date(rx.consultDate) : (rx.createdAt ? new Date(rx.createdAt) : new Date());
      const pName = rx.patientName || 'Unknown Patient';
      const pPhone = rx.patientPhone || '';
      const pAge = rx.patientAge || 0;
      const patientKey = pPhone ? pPhone.trim() : `${pName.trim().toLowerCase()}_${pAge}`;

      allVisits.push({
        id: `offline_${rx.id}`,
        patientKey,
        patientName: pName,
        patientAge: pAge,
        patientGender: rx.patientGender || 'Not Specified',
        patientPhone: pPhone,
        consultDate: visitDate,
        dateStr: visitDate.toISOString().split('T')[0],
        type: 'Clinic Rx',
        diagnosis: rx.diagnosis || 'General Consultation'
      });
    });

    onlineAppts.forEach(appt => {
      const visitDate = appt.appointmentDate ? new Date(appt.appointmentDate) : (appt.createdAt ? new Date(appt.createdAt) : new Date());
      const pName = appt.patientName || appt.patient?.name || 'Online Patient';
      const pPhone = appt.patientPhone || appt.patient?.phone || '';
      const pAge = appt.patientAge || appt.patient?.age || 0;
      const patientKey = pPhone ? pPhone.trim() : `${pName.trim().toLowerCase()}_${pAge}`;

      allVisits.push({
        id: `online_${appt.id}`,
        patientKey,
        patientName: pName,
        patientAge: pAge,
        patientGender: 'Not Specified',
        patientPhone: pPhone,
        consultDate: visitDate,
        dateStr: visitDate.toISOString().split('T')[0],
        type: 'Telehealth',
        slotTime: appt.slotTime || '17:00 - 17:30',
        diagnosis: appt.prescription?.diagnosis || appt.symptoms || 'Telehealth Consultation'
      });
    });

    // Sort all visits chronologically ascending
    allVisits.sort((a, b) => a.consultDate.getTime() - b.consultDate.getTime());

    // 4. Determine New Patient vs. Follow-up status
    const patientFirstVisitMap = new Map(); // patientKey -> firstDate
    const patientTotalVisitsMap = new Map(); // patientKey -> count

    allVisits.forEach(v => {
      const count = (patientTotalVisitsMap.get(v.patientKey) || 0) + 1;
      patientTotalVisitsMap.set(v.patientKey, count);

      if (!patientFirstVisitMap.has(v.patientKey)) {
        patientFirstVisitMap.set(v.patientKey, v.dateStr);
        v.isNewPatient = true;
        v.visitNumber = 1;
      } else {
        const firstDate = patientFirstVisitMap.get(v.patientKey);
        // If it's the exact same day, treat same-day multi-entries as same visit; if different day, it's a follow-up
        if (v.dateStr === firstDate && count === 1) {
          v.isNewPatient = true;
          v.visitNumber = 1;
        } else {
          v.isNewPatient = false;
          v.visitNumber = count;
        }
      }
    });

    // 5. Aggregate by Month
    const monthlyMap = new Map(); // "YYYY-MM" -> { month, monthLabel, total, newPatients, followUps, uniquePatients: Set }
    const dailyMap = new Map(); // "YYYY-MM-DD" -> { date, dateLabel, dayOfWeek, total, newPatients, followUps, visits: [] }
    const dayOfWeekMap = {
      'Monday': { name: 'Mon', total: 0, newPatients: 0, followUps: 0, dayCount: new Set() },
      'Tuesday': { name: 'Tue', total: 0, newPatients: 0, followUps: 0, dayCount: new Set() },
      'Wednesday': { name: 'Wed', total: 0, newPatients: 0, followUps: 0, dayCount: new Set() },
      'Thursday': { name: 'Thu', total: 0, newPatients: 0, followUps: 0, dayCount: new Set() },
      'Friday': { name: 'Fri', total: 0, newPatients: 0, followUps: 0, dayCount: new Set() },
      'Saturday': { name: 'Sat', total: 0, newPatients: 0, followUps: 0, dayCount: new Set() },
      'Sunday': { name: 'Sun', total: 0, newPatients: 0, followUps: 0, dayCount: new Set() }
    };

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    allVisits.forEach(v => {
      const d = v.consultDate;
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const dateKey = v.dateStr;
      const dayName = dayNames[d.getDay()];

      // Monthly aggregation
      if (!monthlyMap.has(monthKey)) {
        const monthLabel = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        monthlyMap.set(monthKey, {
          month: monthKey,
          monthLabel,
          total: 0,
          newPatients: 0,
          followUps: 0,
          uniquePatients: new Set()
        });
      }
      const mItem = monthlyMap.get(monthKey);
      mItem.total++;
      if (v.isNewPatient) mItem.newPatients++;
      else mItem.followUps++;
      mItem.uniquePatients.add(v.patientKey);

      // Daily aggregation
      if (!dailyMap.has(dateKey)) {
        const dateLabel = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        dailyMap.set(dateKey, {
          date: dateKey,
          dateLabel,
          dayOfWeek: dayName,
          total: 0,
          newPatients: 0,
          followUps: 0,
          visits: []
        });
      }
      const dItem = dailyMap.get(dateKey);
      dItem.total++;
      if (v.isNewPatient) dItem.newPatients++;
      else dItem.followUps++;
      if (dItem.visits.length < 15) {
        dItem.visits.push({
          patientName: v.patientName,
          patientAge: v.patientAge,
          isNew: v.isNewPatient,
          type: v.type,
          diagnosis: v.diagnosis
        });
      }

      // Day of Week
      if (dayOfWeekMap[dayName]) {
        dayOfWeekMap[dayName].total++;
        if (v.isNewPatient) dayOfWeekMap[dayName].newPatients++;
        else dayOfWeekMap[dayName].followUps++;
        dayOfWeekMap[dayName].dayCount.add(dateKey);
      }
    });

    // Format Monthly List with Month-over-Month Growth
    const sortedMonthKeys = Array.from(monthlyMap.keys()).sort();
    const monthlyVolume = sortedMonthKeys.map((k, idx) => {
      const cur = monthlyMap.get(k);
      let momGrowth = 0;
      if (idx > 0) {
        const prev = monthlyMap.get(sortedMonthKeys[idx - 1]);
        if (prev && prev.total > 0) {
          momGrowth = Math.round(((cur.total - prev.total) / prev.total) * 100);
        }
      }
      return {
        month: cur.month,
        monthLabel: cur.monthLabel,
        total: cur.total,
        newPatients: cur.newPatients,
        followUps: cur.followUps,
        followUpRate: cur.total > 0 ? Math.round((cur.followUps / cur.total) * 100) : 0,
        momGrowth
      };
    });

    // Format Daily List (Sorted descending)
    const sortedDateKeys = Array.from(dailyMap.keys()).sort().reverse();
    let dailyVolume = sortedDateKeys.map(k => {
      const cur = dailyMap.get(k);
      return {
        date: cur.date,
        dateLabel: cur.dateLabel,
        dayOfWeek: cur.dayOfWeek,
        total: cur.total,
        newPatients: cur.newPatients,
        followUps: cur.followUps,
        newRatio: cur.total > 0 ? Math.round((cur.newPatients / cur.total) * 100) : 0,
        followUpRatio: cur.total > 0 ? Math.round((cur.followUps / cur.total) * 100) : 0,
        visits: cur.visits
      };
    });

    // Optional Filter by Month if requested
    if (month) {
      dailyVolume = dailyVolume.filter(d => d.date.startsWith(month));
    }

    // Day of Week Heatmap Array
    const dayOfWeekPattern = Object.entries(dayOfWeekMap).map(([day, val]) => ({
      day,
      shortName: val.name,
      totalVisits: val.total,
      newPatients: val.newPatients,
      followUps: val.followUps,
      distinctDays: val.dayCount.size,
      avgPatientsPerDay: val.dayCount.size > 0 ? (val.total / val.dayCount.size).toFixed(1) : '0.0'
    }));

    // Overall Practice Summary KPIs
    const totalConsultations = allVisits.length;
    const totalUniquePatients = patientFirstVisitMap.size;
    const patientsWithFollowUp = Array.from(patientTotalVisitsMap.values()).filter(cnt => cnt > 1).length;
    const retentionRate = totalUniquePatients > 0 ? Math.round((patientsWithFollowUp / totalUniquePatients) * 100) : 0;
    const distinctActiveDays = dailyMap.size;
    const avgPatientsPerDay = distinctActiveDays > 0 ? (totalConsultations / distinctActiveDays).toFixed(1) : '0.0';
    const totalNewPatients = Array.from(dailyMap.values()).reduce((acc, d) => acc + d.newPatients, 0);
    const totalFollowUps = Array.from(dailyMap.values()).reduce((acc, d) => acc + d.followUps, 0);

    return res.status(200).json({
      success: true,
      data: {
        totalConsultations,
        totalUniquePatients,
        totalNewPatients,
        totalFollowUps,
        retentionRate,
        avgPatientsPerDay,
        distinctActiveDays,
        monthlyVolume,
        dailyVolume,
        dayOfWeekPattern
      }
    });

  } catch (error) {
    console.error('Patient volume analytics error:', error);
    next(error);
  }
}

