import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Create or update an offline prescription.
 */
export async function createOfflinePrescription(req, res) {
  const {
    id,
    patientName,
    patientAge,
    patientGender,
    diagnosis,
    medications,
    advice,
    requiredTests,
    pageWidth,
    pageHeight,
    fontSize,
    marginSize,
    rowSpacing,
    useLetterhead,
    referenceId,
    patientPhone,
    chiefComplaints,
    bp,
    pulse,
    weight,
    followUpDate,
    consultDate
  } = req.body;

  if (!patientName || !patientAge || !patientGender || !diagnosis) {
    return res.status(400).json({
      success: false,
      message: 'Please provide patient details (name, age, gender) and diagnosis.'
    });
  }

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

    let finalReferenceId = referenceId || null;
    if (!id && !finalReferenceId) {
      // Auto-generate referenceId
      const currentYear = new Date().getFullYear();
      const startOfYear = new Date(currentYear, 0, 1);
      const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999);
      const prescriptionsInYear = await prisma.offlinePrescription.findMany({
        where: {
          doctorId: doctorProfile.id,
          createdAt: {
            gte: startOfYear,
            lte: endOfYear
          },
          referenceId: {
            not: null
          }
        },
        select: {
          referenceId: true
        }
      });

      let maxSerial = 0;
      for (const rx of prescriptionsInYear) {
        if (rx.referenceId) {
          const parts = rx.referenceId.split('/');
          const serial = parseInt(parts[0], 10);
          if (!isNaN(serial) && serial > maxSerial) {
            maxSerial = serial;
          }
        }
      }
      finalReferenceId = `${maxSerial + 1}/${currentYear}`;
    }

    const data = {
      doctorId: doctorProfile.id,
      patientName,
      patientAge: parseInt(patientAge, 10),
      patientGender,
      diagnosis,
      medications: medications || [],
      advice: advice || '',
      requiredTests: requiredTests || '',
      pageWidth: pageWidth !== undefined ? parseInt(pageWidth, 10) : 800,
      pageHeight: pageHeight !== undefined ? parseInt(pageHeight, 10) : 1120,
      fontSize: fontSize !== undefined ? parseFloat(fontSize) : 13,
      marginSize: marginSize !== undefined ? parseInt(marginSize, 10) : 40,
      rowSpacing: rowSpacing !== undefined ? parseInt(rowSpacing, 10) : 12,
      useLetterhead: useLetterhead !== undefined ? !!useLetterhead : false,
      referenceId: finalReferenceId,
      patientPhone: patientPhone || null,
      chiefComplaints: chiefComplaints || null,
      bp: bp || null,
      pulse: pulse || null,
      weight: weight || null,
      followUpDate: followUpDate ? new Date(followUpDate) : null,
      consultDate: consultDate ? new Date(consultDate) : null
    };

    let prescription;
    if (id) {
      // Update existing
      prescription = await prisma.offlinePrescription.update({
        where: { id },
        data
      });
    } else {
      // Create new
      prescription = await prisma.offlinePrescription.create({
        data
      });
    }

    return res.status(200).json({
      success: true,
      prescription
    });
  } catch (error) {
    console.error('Error in createOfflinePrescription:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save offline prescription.'
    });
  }
}

/**
 * Get all offline prescriptions for the authenticated doctor.
 */
export async function getOfflinePrescriptions(req, res) {
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

    const prescriptions = await prisma.offlinePrescription.findMany({
      where: { doctorId: doctorProfile.id },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({
      success: true,
      prescriptions
    });
  } catch (error) {
    console.error('Error in getOfflinePrescriptions:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch offline prescriptions.'
    });
  }
}

/**
 * Delete an offline prescription by ID.
 */
export async function deleteOfflinePrescription(req, res) {
  const { id } = req.params;

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

    // Verify ownership
    const prescription = await prisma.offlinePrescription.findUnique({
      where: { id }
    });

    if (!prescription) {
      return res.status(404).json({
        success: false,
        message: 'Prescription not found.'
      });
    }

    if (prescription.doctorId !== doctorProfile.id) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not own this prescription.'
      });
    }

    await prisma.offlinePrescription.delete({
      where: { id }
    });

    return res.status(200).json({
      success: true,
      message: 'Offline prescription deleted successfully.'
    });
  } catch (error) {
    console.error('Error in deleteOfflinePrescription:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete offline prescription.'
    });
  }
}

/**
 * Get next reference ID for the authenticated doctor.
 */
export async function getNextReferenceId(req, res) {
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

    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999);

    const prescriptionsInYear = await prisma.offlinePrescription.findMany({
      where: {
        doctorId: doctorProfile.id,
        createdAt: {
          gte: startOfYear,
          lte: endOfYear
        },
        referenceId: {
          not: null
        }
      },
      select: {
        referenceId: true
      }
    });

    let maxSerial = 0;
    for (const rx of prescriptionsInYear) {
      if (rx.referenceId) {
        const parts = rx.referenceId.split('/');
        const serial = parseInt(parts[0], 10);
        if (!isNaN(serial) && serial > maxSerial) {
          maxSerial = serial;
        }
      }
    }
    const nextSerial = maxSerial + 1;
    const nextReferenceId = `${nextSerial}/${currentYear}`;

    return res.status(200).json({
      success: true,
      nextReferenceId
    });
  } catch (error) {
    console.error('Error in getNextReferenceId:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate next reference number.'
    });
  }
}
