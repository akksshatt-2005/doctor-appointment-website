import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Standard default intervals for Doctor: 5:00 PM to 9:00 PM (17:00 to 21:00) in 30-minute intervals
export const DEFAULT_DOCTOR_INTERVALS = [
  { start: '17:00', end: '17:30' },
  { start: '17:30', end: '18:00' },
  { start: '18:00', end: '18:30' },
  { start: '18:30', end: '19:00' },
  { start: '19:00', end: '19:30' },
  { start: '19:30', end: '20:00' },
  { start: '20:00', end: '20:30' },
  { start: '20:30', end: '21:00' }
];

// Helper to convert 'YYYY-MM-DD' cleanly into a UTC midnight Date object without timezone drift
export function parseDateToUTC(dateStr) {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) {
    return new Date(Date.UTC(dateStr.getFullYear(), dateStr.getMonth(), dateStr.getDate(), 0, 0, 0, 0));
  }
  const parts = String(dateStr).split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts.map(Number);
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  }
  const d = new Date(dateStr);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0));
}

// Helper to generate 30-minute intervals between startTime (HH:MM) and endTime (HH:MM)
export function generate30MinIntervals(startTimeStr, endTimeStr) {
  const intervals = [];
  const [startHour, startMin] = startTimeStr.split(':').map(Number);
  const [endHour, endMin] = endTimeStr.split(':').map(Number);

  let currentMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  const pad = (num) => String(num).padStart(2, '0');

  while (currentMinutes < endMinutes) {
    const nextMinutes = currentMinutes + 30;
    if (nextMinutes > endMinutes) break;

    const startH = Math.floor(currentMinutes / 60);
    const startM = currentMinutes % 60;
    const endH = Math.floor(nextMinutes / 60);
    const endM = nextMinutes % 60;

    intervals.push({
      start: `${pad(startH)}:${pad(startM)}`,
      end: `${pad(endH)}:${pad(endM)}`
    });
    currentMinutes = nextMinutes;
  }
  return intervals;
}

// Helper to convert HH:MM to 12-hour AM/PM label (e.g. "17:00" -> "05:00 PM")
export function formatTimeLabel(timeStr) {
  if (!timeStr) return '';
  let [hours, minutes] = timeStr.split(':').map(Number);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 becomes 12
  const strMinutes = minutes < 10 ? '0' + minutes : minutes;
  const strHours = hours < 10 ? '0' + hours : hours;
  return `${strHours}:${strMinutes} ${ampm}`;
}

/**
 * Ensures all doctors have weekly templates (5:00 PM to 9:00 PM, 7 days) and
 * pre-generates bookable slots for the next 90 days.
 */
export async function ensureDoctorAvailabilityAndTemplates() {
  try {
    const doctors = await prisma.doctorProfile.findMany({
      include: { templates: true, user: true }
    });

    if (doctors.length === 0) {
      console.log('[SlotService] No doctors found to provision slots.');
      return;
    }

    const today = new Date();

    for (const doctor of doctors) {
      // 1. Ensure weekly templates exist for all 7 days (0..6) for 5 PM to 9 PM
      if (!doctor.templates || doctor.templates.length < 7) {
        console.log(`[SlotService] Configuring 5 PM - 9 PM templates for doctor: ${doctor.user?.name || doctor.id}`);
        await prisma.availabilityTemplate.deleteMany({
          where: { doctorId: doctor.id }
        });

        const templateEntries = [];
        for (let day = 0; day <= 6; day++) {
          templateEntries.push({
            doctorId: doctor.id,
            dayOfWeek: day,
            startTime: '17:00',
            endTime: '21:00',
            consultType: 'ONLINE'
          });
        }
        await prisma.availabilityTemplate.createMany({
          data: templateEntries
        });
      }

      // 2. Pre-generate slots for next 90 days rolling
      for (let i = 0; i < 90; i++) {
        const slotDate = new Date();
        slotDate.setDate(today.getDate() + i);
        const utcSlotDate = parseDateToUTC(slotDate);

        for (const interval of DEFAULT_DOCTOR_INTERVALS) {
          try {
            await prisma.availabilitySlot.upsert({
              where: {
                unique_doctor_slot: {
                  doctorId: doctor.id,
                  date: utcSlotDate,
                  startTime: interval.start
                }
              },
              update: {
                endTime: interval.end,
                consultType: 'ONLINE'
              },
              create: {
                doctorId: doctor.id,
                date: utcSlotDate,
                startTime: interval.start,
                endTime: interval.end,
                consultType: 'ONLINE',
                isBooked: false
              }
            });
          } catch (upsertErr) {
            // Ignore unique constraint races
          }
        }
      }
    }
    console.log('[SlotService] Successfully ensured 5 PM - 9 PM daily slots for all doctors (next 90 days).');
  } catch (error) {
    console.error('[SlotService Error] Failed to ensure doctor availability:', error);
  }
}

/**
 * Doctor-authenticated endpoint: Create or replace availability templates.
 * Request body: { templates: [{ dayOfWeek: 1, startTime: "17:00", endTime: "21:00", consultType: "ONLINE" }, ...] }
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
    const doctorProfile = await prisma.doctorProfile.findUnique({
      where: { userId: req.user.phone ? undefined : req.user.id }
    });

    if (!doctorProfile) {
      return res.status(404).json({
        success: false,
        message: 'Doctor profile not found.'
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.availabilityTemplate.deleteMany({
        where: { doctorId: doctorProfile.id }
      });

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
 * Doctor-authenticated endpoint: Generate concrete bookable slots for the next 30 days
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

    const today = new Date();
    let createdCount = 0;

    for (let i = 0; i < 30; i++) {
      const slotDate = new Date();
      slotDate.setDate(today.getDate() + i);
      const utcSlotDate = parseDateToUTC(slotDate);

      const dayOfWeek = utcSlotDate.getUTCDay();
      const matchingTemplates = (doctorProfile.templates || []).filter(
        t => t.dayOfWeek === dayOfWeek
      );

      const intervals = matchingTemplates.length > 0
        ? matchingTemplates.flatMap(t => generate30MinIntervals(t.startTime, t.endTime).map(int => ({ ...int, consultType: t.consultType })))
        : DEFAULT_DOCTOR_INTERVALS.map(int => ({ ...int, consultType: 'ONLINE' }));

      for (const interval of intervals) {
        try {
          await prisma.availabilitySlot.upsert({
            where: {
              unique_doctor_slot: {
                doctorId: doctorProfile.id,
                date: utcSlotDate,
                startTime: interval.start
              }
            },
            update: {
              endTime: interval.end,
              consultType: interval.consultType || 'ONLINE'
            },
            create: {
              doctorId: doctorProfile.id,
              date: utcSlotDate,
              startTime: interval.start,
              endTime: interval.end,
              consultType: interval.consultType || 'ONLINE',
              isBooked: false
            }
          });
          createdCount++;
        } catch (upsertError) {
          // Ignore duplicates
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: `Successfully generated bookable slots for the next 30 days.`,
      slotsGenerated: createdCount
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Public endpoint: GET /api/v1/doctors/:id/availability?date=YYYY-MM-DD
 * Returns slots for the given date.
 * PERMANENT GUARANTEE: If slots do not exist yet in the database for the requested date,
 * this endpoint automatically creates them on-the-fly for the doctor (5:00 PM to 9:00 PM daily).
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
    const searchDate = parseDateToUTC(date);

    // 1. Locate Doctor Profile (or fallback to primary doctor if ID not matched)
    let doctor = await prisma.doctorProfile.findUnique({
      where: { id },
      include: { templates: true }
    });

    if (!doctor) {
      doctor = await prisma.doctorProfile.findFirst({
        include: { templates: true }
      });
      if (!doctor) {
        return res.status(404).json({
          success: false,
          message: 'Doctor profile not found.'
        });
      }
    }

    const doctorId = doctor.id;

    // 2. Fetch existing slots for this doctor and UTC date
    let slots = await prisma.availabilitySlot.findMany({
      where: {
        doctorId: doctorId,
        date: searchDate
      },
      orderBy: {
        startTime: 'asc'
      }
    });

    // 3. Auto-generation on demand: If slots are missing or incomplete, create the 5 PM - 9 PM slots!
    if (!slots || slots.length === 0) {
      const dayOfWeek = searchDate.getUTCDay();
      const matchingTemplates = (doctor.templates || []).filter(t => t.dayOfWeek === dayOfWeek);

      let intervalsToCreate = [];

      if (matchingTemplates.length > 0) {
        for (const template of matchingTemplates) {
          const intervals = generate30MinIntervals(template.startTime, template.endTime);
          for (const interval of intervals) {
            intervalsToCreate.push({
              start: interval.start,
              end: interval.end,
              consultType: template.consultType || 'ONLINE'
            });
          }
        }
      }

      if (intervalsToCreate.length === 0) {
        // Default standard 5 PM to 9 PM slots
        intervalsToCreate = DEFAULT_DOCTOR_INTERVALS.map(int => ({
          ...int,
          consultType: 'ONLINE'
        }));
      }

      for (const interval of intervalsToCreate) {
        try {
          await prisma.availabilitySlot.upsert({
            where: {
              unique_doctor_slot: {
                doctorId: doctorId,
                date: searchDate,
                startTime: interval.start
              }
            },
            update: {
              endTime: interval.end,
              consultType: interval.consultType
            },
            create: {
              doctorId: doctorId,
              date: searchDate,
              startTime: interval.start,
              endTime: interval.end,
              consultType: interval.consultType,
              isBooked: false
            }
          });
        } catch (err) {
          // Ignore unique constraint races
        }
      }

      // Re-query slots now that they are guaranteed to exist
      slots = await prisma.availabilitySlot.findMany({
        where: {
          doctorId: doctorId,
          date: searchDate
        },
        orderBy: {
          startTime: 'asc'
        }
      });
    }

    return res.status(200).json({
      success: true,
      date,
      slots: slots.map(s => ({
        id: s.id,
        startTime: s.startTime,
        endTime: s.endTime,
        consultType: s.consultType,
        label: formatTimeLabel(s.startTime)
      }))
    });
  } catch (error) {
    next(error);
  }
}
