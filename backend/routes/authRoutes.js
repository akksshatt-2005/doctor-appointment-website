import express from 'express';
import { sendOtp, verifyOtp, loginDoctor, registerPatient, verifyFirebaseToken } from '../controllers/authController.js';

const router = express.Router();

// Route for generating and sending OTP to phone number
router.post('/otp/send', sendOtp);

// Route for verifying OTP and issuing JWT token
router.post('/otp/verify', verifyOtp);

// Route for registering new patient with name & registrationToken
router.post('/register', registerPatient);

// Route for doctor email/password login
router.post('/doctor/login', loginDoctor);

// Route for verifying Firebase ID Token and signing JWT
router.post('/firebase-login', verifyFirebaseToken);

export default router;
