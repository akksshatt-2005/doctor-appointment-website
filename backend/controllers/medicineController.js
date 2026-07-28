import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Add or update a medicine in the doctor's database.
 */
export async function addMedicine(req, res) {
  const { name, dosage, composition } = req.body;

  if (!name) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a medicine name.'
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

    const medicine = await prisma.medicine.upsert({
      where: {
        doctorId_name: {
          doctorId: doctorProfile.id,
          name: name.trim()
        }
      },
      update: {
        dosage: dosage ? dosage.trim() : null,
        composition: composition ? composition.trim() : null
      },
      create: {
        doctorId: doctorProfile.id,
        name: name.trim(),
        dosage: dosage ? dosage.trim() : null,
        composition: composition ? composition.trim() : null
      }
    });

    return res.status(200).json({
      success: true,
      medicine
    });
  } catch (error) {
    console.error('Error in addMedicine:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save medicine.'
    });
  }
}

/**
 * Get all medicines in the doctor's database.
 */
export async function getMedicines(req, res) {
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

    const medicines = await prisma.medicine.findMany({
      where: { doctorId: doctorProfile.id },
      orderBy: { name: 'asc' }
    });

    return res.status(200).json({
      success: true,
      medicines
    });
  } catch (error) {
    console.error('Error in getMedicines:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch medicines.'
    });
  }
}

/**
 * Update a medicine (change name/spelling or dosage) by ID.
 */
export async function updateMedicine(req, res) {
  const { id } = req.params;
  const { name, dosage, composition } = req.body;

  if (!name) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a medicine name.'
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

    const medicine = await prisma.medicine.findUnique({
      where: { id }
    });

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found.'
      });
    }

    if (medicine.doctorId !== doctorProfile.id) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not own this medicine record.'
      });
    }

    // Check duplicate name for other records
    if (name.trim().toLowerCase() !== medicine.name.toLowerCase()) {
      const duplicate = await prisma.medicine.findFirst({
        where: {
          doctorId: doctorProfile.id,
          name: {
            equals: name.trim(),
            mode: 'insensitive'
          },
          id: { not: id }
        }
      });

      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: 'A medicine with this name already exists in your database.'
        });
      }
    }

    const updated = await prisma.medicine.update({
      where: { id },
      data: {
        name: name.trim(),
        dosage: dosage ? dosage.trim() : null,
        composition: composition ? composition.trim() : null
      }
    });

    return res.status(200).json({
      success: true,
      medicine: updated
    });
  } catch (error) {
    console.error('Error in updateMedicine:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update medicine.'
    });
  }
}

/**
 * Delete a medicine from the doctor's database.
 */
export async function deleteMedicine(req, res) {
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

    const medicine = await prisma.medicine.findUnique({
      where: { id }
    });

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found.'
      });
    }

    if (medicine.doctorId !== doctorProfile.id) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not own this medicine record.'
      });
    }

    await prisma.medicine.delete({
      where: { id }
    });

    return res.status(200).json({
      success: true,
      message: 'Medicine deleted successfully.'
    });
  } catch (error) {
    console.error('Error in deleteMedicine:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete medicine.'
    });
  }
}
