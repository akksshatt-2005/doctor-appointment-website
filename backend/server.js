import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { connectRedis } from './config/redis.js';
import authRoutes from './routes/authRoutes.js';
import slotRoutes from './routes/slotRoutes.js';
import appointmentRoutes from './routes/appointmentRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import offlinePrescriptionRoutes from './routes/offlinePrescriptionRoutes.js';
import medicineRoutes from './routes/medicineRoutes.js';
import path from 'path';
import { startReminderScheduler } from './services/scheduler.js';
import { ensureDoctorAvailabilityAndTemplates } from './controllers/slotController.js';



// Load environment variables
dotenv.config();

// Connect to Redis
await connectRedis();


const app = express();
const server = http.createServer(app);
const prisma = new PrismaClient();

const PORT = process.env.PORT || 5000;

// Enable CORS
const allowedOrigins = [
  process.env.CLIENT_URL_PATIENT || 'http://localhost:3000',
  process.env.CLIENT_URL_DOCTOR || 'http://localhost:4000'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    
    const isAllowed = allowedOrigins.indexOf(origin) !== -1 || 
                      process.env.NODE_ENV === 'development' ||
                      origin.endsWith('.vercel.app') ||
                      /^https?:\/\/localhost:\d+$/.test(origin);

    if (isAllowed) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));
app.use(express.urlencoded({ extended: true }));


// Socket.io for real-time notifications and chat
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Store connected users for signaling / alerts
const connectedUsers = new Map(); // userId -> socketId

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  
  socket.on('register', (userId) => {
    connectedUsers.set(userId, socket.id);
    console.log(`User ${userId} registered with socket ID ${socket.id}`);
  });

  socket.on('join_consultation', ({ bookingId, role }) => {
    socket.join(bookingId);
    console.log(`Socket ${socket.id} (${role}) joined consultation room: ${bookingId}`);
  });

  socket.on('chat_message', ({ bookingId, sender, text }) => {
    io.to(bookingId).emit('chat_message', { sender, text, timestamp: new Date().toLocaleTimeString() });
  });

  socket.on('end_consultation', ({ bookingId }) => {
    io.to(bookingId).emit('consultation_ended');
  });

  socket.on('prescription_posted', ({ bookingId, pdfUrl }) => {
    io.to(bookingId).emit('prescription_ready', { pdfUrl });
  });

  socket.on('disconnect', () => {
    for (const [userId, socketId] of connectedUsers.entries()) {
      if (socketId === socket.id) {
        connectedUsers.delete(userId);
        console.log(`User ${userId} disconnected`);
        break;
      }
    }
  });
});

// Attach socket io instance to express app so controllers can access it
app.set('io', io);
app.set('connectedUsers', connectedUsers);

// Health Check Endpoint
app.get('/api/v1/health', async (req, res) => {
  try {
    // Check Database Connectivity
    await prisma.$queryRaw`SELECT 1`;
    
    return res.status(200).json({
      status: 'healthy',
      timestamp: new Date(),
      services: {
        database: 'connected',
        server: 'running'
      }
    });
  } catch (error) {
    console.error('Database connection test failed:', error);
    return res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date(),
      services: {
        database: 'disconnected',
        server: 'running'
      },
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Import and register routes here
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1', slotRoutes);
app.use('/api/v1', appointmentRoutes);
app.use('/api/v1', paymentRoutes);
app.use('/api/v1', offlinePrescriptionRoutes);
app.use('/api/v1', medicineRoutes);

// Serve uploads statically for local storage fallback
app.use('/uploads', express.static(path.resolve('uploads')));



// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// Start server
server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  startReminderScheduler();
  // Ensure 5 PM to 9 PM daily slots are seeded and ready
  await ensureDoctorAvailabilityAndTemplates();
});

export { app, server, prisma, io };
