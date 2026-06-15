import dotenv from 'dotenv';
import { Resend } from 'resend';

dotenv.config();

console.log('Testing Resend API key...');
console.log('RESEND_API_KEY:', process.env.RESEND_API_KEY ? `${process.env.RESEND_API_KEY.substring(0, 10)}...` : 'NOT FOUND');

if (!process.env.RESEND_API_KEY) {
  console.error('ERROR: No RESEND_API_KEY found in .env file!');
  process.exit(1);
}

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendTestEmail() {
  try {
    const response = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: 'asadisse12@gmail.com', // Replace with your email
      subject: 'Test Email from DugsiKabe',
      html: '<strong>It works!</strong> This email was sent using Resend.',
    });

    console.log('SUCCESS! Email sent:', response);
  } catch (error) {
    console.error('ERROR sending email:', error);
  }
}

sendTestEmail();
