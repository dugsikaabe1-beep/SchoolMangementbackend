import { Server } from 'socket.io';

let io;

export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        // Allow all origins in dev, and specific origins in prod
        const isDev = process.env.NODE_ENV === 'development';
        const isAllowed = isDev || 
          origin === 'https://dugsihub-lilac.vercel.app' || 
          (origin && origin.startsWith('http://localhost:')) ||
          (origin && origin.includes('ngrok-free.dev'));
        
        if (isAllowed || !origin) {
          return callback(null, true);
        }
        
        console.log(`[Socket] Rejecting CORS for origin: ${origin}`);
        return callback(new Error('Not allowed by CORS'));
      },
      methods: ['GET', 'POST'],
      credentials: true
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
