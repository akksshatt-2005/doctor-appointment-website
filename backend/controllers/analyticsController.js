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

/**
 * GET /api/v1/doctor/analytics/medicine?name=...
 * Deep-dive research analytics for a specific searched medication.
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

    const { name, timeframe } = req.query;
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a medicine name to search.'
      });
    }

    const searchTarget = normalizeMedName(name);
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
    const ageBins = { '<18': 0, '18-30': 0, '31-45': 0, '46-60': 0, '60+': 0 };
    const genderMap = { Male: 0, Female: 0, Other: 0 };
    const matchingRecords = [];
    let canonicalName = name.trim();
    let canonicalComposition = '';

    function checkAndProcessRecord(rx, isOnline = false) {
      let rawMeds = isOnline ? rx.prescription?.medications : rx.medications;
      if (typeof rawMeds === 'string') {
        try { rawMeds = JSON.parse(rawMeds); } catch (e) { rawMeds = []; }
      }
      if (!Array.isArray(rawMeds)) return;

      // Check if this prescription contains the searched medicine
      const foundMed = rawMeds.find(m => {
        if (!m || !m.name) return false;
        const normName = normalizeMedName(m.name);
        const normComp = normalizeMedName(m.composition || '');
        return normName.includes(searchTarget) || normComp.includes(searchTarget);
      });

      if (!foundMed) return;

      canonicalName = foundMed.name;
      if (foundMed.composition && !canonicalComposition) {
        canonicalComposition = foundMed.composition;
      }

      totalOccurrences++;
      const qty = estimateQuantity(foundMed);
      totalQuantity += qty;

      const pName = isOnline ? rx.patientName : rx.patientName;
      const pPhone = isOnline ? (rx.patientPhone || rx.patient?.phone) : (rx.patientPhone || '');
      const pAge = isOnline ? rx.patientAge : rx.patientAge;
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

      // Co-prescribed medicines
      rawMeds.forEach(otherMed => {
        if (!otherMed || !otherMed.name) return;
        const otherNorm = normalizeMedName(otherMed.name);
        if (otherNorm !== normalizeMedName(foundMed.name)) {
          const otherDisplay = otherMed.name.trim();
          coPrescribedMap.set(otherDisplay, (coPrescribedMap.get(otherDisplay) || 0) + 1);
        }
      });

      // Sample recent records (up to 10)
      if (matchingRecords.length < 10) {
        matchingRecords.push({
          id: rx.id,
          date: createdAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
          patientName: pName,
          patientAge: pAge,
          patientGender: pGender,
          diagnosis,
          dosage: foundMed.dosage || '-',
          frequency: foundMed.frequency || foundMed.freq || '-',
          estimatedQty: qty
        });
      }
    }

    offlineRxs.forEach(rx => checkAndProcessRecord(rx, false));
    onlineAppts.forEach(appt => checkAndProcessRecord(appt, true));

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

    // Top Diagnoses for this medicine
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
        searchedQuery: name,
        canonicalName,
        canonicalComposition,
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
