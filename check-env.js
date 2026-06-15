import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file from backend directory
const envPath = path.resolve(__dirname, '.env');
console.log('Looking for .env file at:', envPath);

dotenv.config({ path: envPath });

console.log('--- Environment Variables ---');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('MONGODB_URI:', process.env.MONGODB_URI ? `${process.env.MONGODB_URI.slice(0, 30)}...` : 'NOT SET');
console.log('RESEND_API_KEY:', process.env.RESEND_API_KEY ? `${process.env.RESEND_API_KEY.slice(0, 8)}...` : 'NOT SET');
console.log('EMAIL_HOST:', process.env.EMAIL_HOST);
console.log('EMAIL_PORT:', process.env.EMAIL_PORT);
console.log('EMAIL_SECURE:', process.env.EMAIL_SECURE);
console.log('EMAIL_USER:', process.env.EMAIL_USER);
console.log('EMAIL_FROM:', process.env.EMAIL_FROM);
console.log('CLIENT_URL:', process.env.CLIENT_URL);
console.log('--- End ---');