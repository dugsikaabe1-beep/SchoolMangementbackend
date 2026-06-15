import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

async function testSMTP() {
  console.log('Testing SMTP connection...');
  console.log('EMAIL_HOST:', process.env.EMAIL_HOST);
  console.log('EMAIL_PORT:', process.env.EMAIL_PORT);
  console.log('EMAIL_SECURE:', process.env.EMAIL_SECURE);
  console.log('EMAIL_USER:', process.env.EMAIL_USER);
  console.log('EMAIL_FROM:', process.env.EMAIL_FROM);

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT, 10),
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    console.log('Transporter created, verifying connection...');
    await transporter.verify();
    console.log('✅ SMTP Connection Successful!');

    // Now try sending a test email
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: 'test@example.com',
      subject: 'Test Email from DugsiKabe',
      text: 'Hello from DugsiKabe SMTP test!',
    });

    console.log('✅ Test email sent successfully!');
    console.log('Message ID:', info.messageId);
  } catch (error) {
    console.error('❌ SMTP Error:', error.message);
    console.error('Full error stack:', error.stack);
  }
}

testSMTP();