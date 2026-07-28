import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { redisClient, connectRedis } from '../config/redis.js';
import { sendOtpCode } from '../services/notificationService.js';

const prisma = new PrismaClient();

// Helper to hash OTP using SHA-256
function hashOtp(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

/**
 * Generate and send 6-digit OTP code to the patient's phone.
 * Rate limit: max 5 send attempts per phone per hour.
 */
export async function sendOtp(req, res, next) {
  const { phone } = req.body;

  if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid 10-digit Indian mobile number.'
    });
  }

  try {
    await connectRedis();

    const sendLimitKey = `otp:send_limit:${phone}`;
    const otpKey = `otp:${phone}`;

    // 1. Check Rate Limit (Send attempts)
    const sendAttempts = await redisClient.get(sendLimitKey);
    if (sendAttempts && parseInt(sendAttempts, 10) >= 5) {
      return res.status(429).json({
        success: false,
        message: 'SMS sending limit exceeded. Please try again after 1 hour.'
      });
    }

    // 2. Generate 6-digit OTP
    // In production, use crypto.randomInt(100000, 999999).toString()
    const otp = crypto.randomInt(100000, 999999).toString();
    const hashed = hashOtp(otp);

    // 3. Store hashed OTP in Redis with 5-minute TTL (300 seconds)
    await redisClient.set(otpKey, hashed, { EX: 300 });

    // 4. Increment rate limit counter
    if (!sendAttempts) {
      await redisClient.set(sendLimitKey, '1', { EX: 3600 });
    } else {
      await redisClient.incr(sendLimitKey);
    }

    // 5. Send OTP (calls stubbed log service)
    await sendOtpCode(phone, otp);

    return res.status(200).json({
      success: true,
      message: 'A 6-digit verification code has been simulated. Please check console logs.'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Verify OTP and issue a short-lived token scoped for booking.
 * Rate limit: max 5 verification attempts per code/session.
 */
export async function verifyOtp(req, res, next) {
  const { phone, code } = req.body;

  if (!phone || !code || !/^\d{6}$/.test(code)) {
    return res.status(400).json({
      success: false,
      message: 'Please provide both phone number and the 6-digit verification code.'
    });
  }

  try {
    await connectRedis();

    const otpKey = `otp:${phone}`;
    const verifyLimitKey = `otp:verify_limit:${phone}`;

    // 1. Check Rate Limit (Verification attempts)
    const verifyAttempts = await redisClient.get(verifyLimitKey);
    if (verifyAttempts && parseInt(verifyAttempts, 10) >= 5) {
      return res.status(429).json({
        success: false,
        message: 'Too many failed verification attempts. Please request a new OTP.'
      });
    }

    // Increment verify attempts counter
    if (!verifyAttempts) {
      await redisClient.set(verifyLimitKey, '1', { EX: 300 });
    } else {
      await redisClient.incr(verifyLimitKey);
    }

    // 2. Fetch Stored OTP hash
    const storedHash = await redisClient.get(otpKey);
    if (!storedHash) {
      return res.status(400).json({
        success: false,
        message: 'The verification code has expired or is invalid. Please request a new OTP.'
      });
    }

    // 3. Compare incoming code hash with stored hash
    const incomingHash = hashOtp(code);
    if (incomingHash !== storedHash) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code.'
      });
    }

    // 4. Verification Successful - Cleanup verification state in Redis
    await redisClient.del(otpKey);
    await redisClient.del(verifyLimitKey);

    // Find or create user in the database
    const { name } = req.body;
    let dbUser = await prisma.user.findUnique({
      where: { phone }
    });

    if (!dbUser) {
      if (!name) {
        // Return verification success but userExists: false with a signed registrationToken
        const secret = process.env.JWT_ACCESS_SECRET || 'jwt_access_secret_neuro_harmony';
        const registrationToken = jwt.sign(
          { phone, scope: 'register' },
          secret,
          { expiresIn: '5m' }
        );
        return res.status(200).json({
          success: true,
          userExists: false,
          registrationToken,
          message: 'Phone verified. Registration profile required.'
        });
      }

      dbUser = await prisma.user.create({
        data: {
          phone,
          name,
          role: 'PATIENT'
        }
      });
    }

    // 5. Generate short-lived JWT scoped for completing a booking (15 minutes expiry)
    const secret = process.env.JWT_ACCESS_SECRET || 'jwt_access_secret_neuro_harmony';
    const token = jwt.sign(
      {
        id: dbUser.id,
        phone: dbUser.phone,
        scope: 'complete_booking',
        role: 'patient'
      },
      secret,
      { expiresIn: '15m' }
    );

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: dbUser.id,
        name: dbUser.name,
        phone: dbUser.phone
      },
      message: 'Authentication successful.'
    });
  } catch (error) {
    next(error);
  }
}

export async function loginDoctor(req, res, next) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Please provide both email and password.'
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user || user.role !== 'DOCTOR') {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    const secret = process.env.JWT_ACCESS_SECRET || 'jwt_access_secret_neuro_harmony';
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: 'DOCTOR'
      },
      secret,
      { expiresIn: '24h' }
    );

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function registerPatient(req, res, next) {
  const { name, registrationToken } = req.body;

  if (!name || !registrationToken) {
    return res.status(400).json({
      success: false,
      message: 'Please provide both your name and registration token.'
    });
  }

  try {
    const secret = process.env.JWT_ACCESS_SECRET || 'jwt_access_secret_neuro_harmony';
    let decoded;
    try {
      decoded = jwt.verify(registrationToken, secret);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired registration token. Please verify OTP again.'
      });
    }

    if (decoded.scope !== 'register') {
      return res.status(401).json({
        success: false,
        message: 'Invalid registration token scope.'
      });
    }

    const phone = decoded.phone;

    // Create the user in database if they don't already exist
    let user = await prisma.user.findUnique({
      where: { phone }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          phone,
          name,
          role: 'PATIENT'
        }
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        phone: user.phone,
        scope: 'complete_booking',
        role: 'patient'
      },
      secret,
      { expiresIn: '15m' }
    );

    return res.status(201).json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone
      },
      message: 'Account registered successfully.'
    });

  } catch (error) {
    next(error);
  }
}

/**
 * Verify Firebase ID Token, resolve/create patient user, and issue session JWT
 */
export async function verifyFirebaseToken(req, res, next) {
  const { idToken, name } = req.body;

  if (!idToken) {
    return res.status(400).json({
      success: false,
      message: 'ID Token is required.'
    });
  }

  try {
    const apiKey = process.env.FIREBASE_API_KEY || 'AIzaSyDOI2Du99T3QzUrkCGCvcKG_hIyWtzLQ0I';
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    });

    const data = await response.json();
    if (!response.ok || !data.users || data.users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired Firebase ID Token.'
      });
    }

    const firebaseUser = data.users[0];
    let phone = firebaseUser.phoneNumber; // e.g. "+919876543210"
    let email = firebaseUser.email;
    let displayName = firebaseUser.displayName;

    if (!phone && !email) {
      return res.status(400).json({
        success: false,
        message: 'No email or phone number found in token.'
      });
    }

    let dbUser;

    if (phone) {
      // Convert international format "+919876543210" to local "9876543210"
      if (phone.startsWith('+91')) {
        phone = phone.replace('+91', '');
      } else if (phone.startsWith('+')) {
        phone = phone.substring(1);
      }

      dbUser = await prisma.user.findUnique({
        where: { phone }
      });
    } else if (email) {
      dbUser = await prisma.user.findUnique({
        where: { email }
      });
    }

    if (!dbUser) {
      const resolvedName = name || displayName || 'Patient';

      dbUser = await prisma.user.create({
        data: {
          phone: phone || null,
          email: email || null,
          name: resolvedName,
          role: 'PATIENT'
        }
      });
    }

    // Generate short-lived JWT scoped for completing a booking (15 minutes expiry)
    const secret = process.env.JWT_ACCESS_SECRET || 'jwt_access_secret_neuro_harmony';
    const jwtToken = jwt.sign(
      {
        id: dbUser.id,
        phone: dbUser.phone || '',
        email: dbUser.email || '',
        scope: 'complete_booking',
        role: 'patient'
      },
      secret,
      { expiresIn: '15m' }
    );

    return res.status(200).json({
      success: true,
      token: jwtToken,
      user: {
        id: dbUser.id,
        name: dbUser.name,
        phone: dbUser.phone,
        email: dbUser.email
      },
      message: 'Authentication successful.'
    });

  } catch (error) {
    next(error);
  }
}

