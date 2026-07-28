import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Helper to generate 30-minute intervals between startTime (HH:MM) and endTime (HH:MM)
function generate30MinIntervals(startTimeStr, endTimeStr) {
  const intervals = [];
  const [startHour, startMin] = startTimeStr.split(':').map(Number);
  const [endHour, endMin] = endTimeStr.split(':').map(Number);
  
  let current = new Date();
  current.setHours(startHour, startMin, 0, 0);
  
  const end = new Date();
  end.setHours(endHour, endMin, 0, 0);
  
  const pad = (num) => String(num).padStart(2, '0');

  while (current < end) {
    const next = new Date(current.getTime() + 30 * 60 * 1000); // add 30 minutes
    if (next > end) break;
    
    intervals.push({
      start: `${pad(current.getHours())}:${pad(current.getMinutes())}`,
      end: `${pad(next.getHours())}:${pad(next.getMinutes())}`
    });
    current = next;
  }
  return intervals;
}

/**
 * Doctor-authenticated endpoint: Create or replace availability templates.
 * Request body: { templates: [{ dayOfWeek: 1, startTime: "11:00", endTime: "16:00", consultType: "CLINIC" }, ...] }
 */
export async function createTemplates(req, res, next) {
  const { templates } = req.body;

  if (!Array.isArray(templates)) {
    return res.status(400).json({
      success: false,
      message: 'Templates must be provided as an array.'
    });
  }

  try {
    // Retrieve doctor profile associated with logged in user
    const doctorProfile = await prisma.doctorProfile.findUnique({
      where: { userId: req.user.phone ? undefined : req.user.id } // check via User ID
    });

    if (!doctorProfile) {
      return res.status(404).json({
        success: false,
        message: 'Doctor profile not found.'
      });
    }

    // Replace all existing templates with the new ones inside a transaction
    await prisma.$transaction(async (tx) => {
      // 1. Delete old templates
      await tx.availabilityTemplate.deleteMany({
        where: { doctorId: doctorProfile.id }
      });

      // 2. Insert new templates
      if (templates.length > 0) {
        await tx.availabilityTemplate.createMany({
          data: templates.map(t => ({
            doctorId: doctorProfile.id,
            dayOfWeek: parseInt(t.dayOfWeek, 10),
            startTime: t.startTime,
            endTime: t.endTime,
            consultType: t.consultType || 'ONLINE'
          }))
        });
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Templates configured successfully.'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Fetch availability templates for the logged in doctor.
 */
export async function getTemplates(req, res, next) {
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

    const templates = await prisma.availabilityTemplate.findMany({
      where: { doctorId: doctorProfile.id },
      orderBy: [
        { dayOfWeek: 'asc' },
        { startTime: 'asc' }
      ]
    });

    return res.status(200).json({
      success: true,
      templates
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Doctor-authenticated endpoint: Generate concrete bookable slots for the next 14 days
 * based on the doctor's weekly templates.
 */
export async function generateConcreteSlots(req, res, next) {
  try {
    const doctorProfile = await prisma.doctorProfile.findUnique({
      where: { userId: req.user.id },
      include: { templates: true }
    });

    if (!doctorProfile) {
      return res.status(404).json({
        success: false,
        message: 'Doctor profile not found.'
      });
    }

    if (doctorProfile.templates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No availability templates configured. Please configure templates first.'
      });
    }

    const today = new Date();
    let createdCount = 0;

    // Loop over the next 14 days (including today)
    for (let i = 0; i < 14; i++) {
      const slotDate = new Date();
      slotDate.setDate(today.getDate() + i);
      slotDate.setHours(0, 0, 0, 0); // standard date at midnight

      const dayOfWeek = slotDate.getDay();

      // Find templates matching this day of the week
      const matchingTemplates = doctorProfile.templates.filter(
        t => t.dayOfWeek === dayOfWeek
      );

      for (const template of matchingTemplates) {
        // Divide time range into 30 minute concrete intervals
        const intervals = generate30MinIntervals(template.startTime, template.endTime);

        for (const interval of intervals) {
          try {
            // Attempt to create the slot (will skip if duplicate due to unique constraint check)
            await prisma.availabilitySlot.upsert({
              where: {
                unique_doctor_slot: {
                  doctorId: doctorProfile.id,
                  date: slotDate,
                  startTime: interval.start
                }
              },
              update: {}, // do nothing if it already exists
              create: {
                doctorId: doctorProfile.id,
                date: slotDate,
                startTime: interval.start,
                endTime: interval.end,
                consultType: template.consultType,
                isBooked: false
              }
            });
            createdCount++;
          } catch (upsertError) {
            // Unique constraint prevents crashes, ignore duplicates
            console.log(`Skipped existing slot: ${slotDate.toDateString()} at ${interval.start}`);
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: `Successfully generated bookable slots for the next 14 days.`,
      slotsGenerated: createdCount
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Public endpoint: GET /api/v1/doctors/:id/availability?date=YYYY-MM-DD
 * Returns open, unbooked slots only for a given date.
 */
export async function getDoctorAvailability(req, res, next) {
  const { id } = req.params; // doctorProfile ID
  const { date } = req.query; // YYYY-MM-DD format

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid date parameter in YYYY-MM-DD format.'
    });
  }

  try {
    const searchDate = new Date(date);
    searchDate.setHours(0, 0, 0, 0);

    const slots = await prisma.availabilitySlot.findMany({
      where: {
        doctorId: id,
        date: searchDate
        // Return all slots for the date so multiple patients can book the same timing
      },
      orderBy: {
        startTime: 'asc'
      }
    });

    return res.status(200).json({
      success: true,
      date,
      slots: slots.map(s => ({
        id: s.id,
        startTime: s.startTime,
        endTime: s.endTime,
        consultType: s.consultType,
        // Format time label for the booking wizard
        label: formatTimeLabel(s.startTime)
      }))
    });
  } catch (error) {
    next(error);
  }
}

// Helper to convert HH:MM to 12 hour AM/PM label
function formatTimeLabel(timeStr) {
  let [hours, minutes] = timeStr.split(':').map(Number);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  const strMinutes = minutes < 10 ? '0' + minutes : minutes;
  const strHours = hours < 10 ? '0' + hours : hours;
  return `${strHours}:${strMinutes} ${ampm}`;
}
