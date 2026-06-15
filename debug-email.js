import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

console.log('=== Starting Email Debug Script ===');
console.log('Loaded ENV vars:');
console.log('- EMAIL_HOST:', process.env.EMAIL_HOST);
console.log('- EMAIL_PORT:', process.env.EMAIL_PORT);
console.log('- EMAIL_SECURE:', process.env.EMAIL_SECURE);
console.log('- EMAIL_USER:', process.env.EMAIL_USER);
console.log('- EMAIL_FROM:', process.env.EMAIL_FROM);
console.log('- EMAIL_PASS is set:', !!process.env.EMAIL_PASS);
console.log();

async function runDebug() {
  try {
    console.log('1. Creating Nodemailer transporter...');
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT, 10),
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      logger: true, // Enable Nodemailer's built-in logging
      debug: true, // Enable debug output
    });
    console.log('   ✅ Transporter created');
    console.log();

    console.log('2. Verifying SMTP connection...');
    await transporter.verify();
    console.log('   ✅ SMTP connection verified!');
    console.log();

    console.log('3. Sending test email...');
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: process.env.EMAIL_USER, // Send email to yourself for testing
      subject: 'DEBUG: Test Email from School ERP',
      html: '<h1>🎉 If you received this, email sending works!</h1>',
    };
    const result = await transporter.sendMail(mailOptions);
    console.log('   ✅ Test email sent successfully!');
    console.log('   Message ID:', result.messageId);
    console.log('   Envelope:', result.envelope);
    console.log();

    console.log('=== All steps passed! Email system is working ===');
  } catch (error) {
    console.error('❌ ERROR OCCURRED:');
    console.error('  Error name:', error.name);
    console.error('  Error message:', error.message);
    console.error('  Full stack:', error.stack);
    if (error.response) {
      console.error('  SMTP Response:', error.response);
    }
  }
}

runDebug();
