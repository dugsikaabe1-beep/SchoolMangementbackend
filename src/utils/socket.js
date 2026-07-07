import { Server } from 'socket.io';
import { parseAllowedOrigins } from '../config/corsConfig.js';

let io;

export const initSocket = (server) => {
  const allowedOrigins = parseAllowedOrigins();
  
  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        
        // Check against allowed list
        const isAllowed = allowedOrigins.some((rule) => {
          if (rule instanceof RegExp) {
            return rule.test(origin);
          }
          return rule === origin;
        });
        
        // Also explicitly allow the known frontends
        const knownFrontends = [
          'https://dugsihub-lilac.vercel.app',
          'https://dugsimaamul.vercel.app',
          'https://dugsikabe.vercel.app',
          'http://localhost:5173',
          'http://127.0.0.1:5173',
          'http://localhost:5174',
          'http://127.0.0.1:5174'
        ];
        
        if (isAllowed || knownFrontends.includes(origin)) {
          return callback(null, true);
        }
        
        console.log(`[Socket] Rejecting CORS for origin: ${origin}`);
        return callback(new Error('Not allowed by CORS'));
      },
      methods: ['GET', 'POST'],
      credentials: true,
      allowedHeaders: ['Authorization', 'Content-Type', 'Origin', 'Accept']
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] New connection: ${socket.id}`);

    // Join a room specific to the user
    socket.on('join', (userId) => {
      if (userId) {
        socket.join(userId);
        console.log(`[Socket] User ${userId} joined their notification room`);
      }
    });

    // Join a room specific to the school (for broadcasts)
    socket.on('joinSchool', (schoolId) => {
      if (schoolId) {
        socket.join(`school_${schoolId}`);
        console.log(`[Socket] User joined school room: school_${schoolId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};

/**
 * Send real-time notification to a specific user
 */
export const emitToUser = (userId, event, data) => {
  if (io) {
    io.to(userId).emit(event, data);
  }
};

/**
 * Broadcast real-time notification to a whole school
 */
export const emitToSchool = (schoolId, event, data) => {
  if (io) {
    io.to(`school_${schoolId}`).emit(event, data);
  }
};
