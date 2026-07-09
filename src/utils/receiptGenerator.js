import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import School from '../models/School.js';
import axios from 'axios';

/**
 * Generate a PDF Receipt for a payment
 * @param {Object} transaction The transaction object
 * @param {Object} student The student object
 * @param {Object} school The school object
 * @returns {Promise<Buffer>} PDF file buffer
 */
export const generateReceiptPdf = async (transaction, student, school) => {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      // 1. Header with Logo
      if (school.logo) {
        try {
          const response = await axios.get(school.logo, { responseType: 'arraybuffer' });
          const logoBuffer = Buffer.from(response.data, 'binary');
          doc.image(logoBuffer, 50, 45, { width: 60 });
        } catch (e) {
          console.warn('Could not load school logo for receipt:', e.message);
        }
      }

      doc
        .fillColor('#333333')
        .fontSize(20)
        .text(school.name || 'School Management System', 120, 50, { align: 'left' })
        .fontSize(10)
        .text(school.address || '', 120, 75, { align: 'left' })
        .text(`Email: ${school.email || ''}`, 120, 90, { align: 'left' })
        .text(`Phone: ${school.phone || ''}`, 120, 105, { align: 'left' });

      doc.moveDown(2);
      
      // Divider
      doc.strokeColor('#cccccc').lineWidth(1).moveTo(50, 130).lineTo(545, 130).stroke();
      doc.moveDown(2);

      // 2. Receipt Title
      doc.fontSize(18).text('PAYMENT RECEIPT', { align: 'center' });
      doc.moveDown(1);

      // 3. Info Table
      const topOffset = 180;
      doc.fontSize(10);
      
      // Left side: Student Info
      doc.font('Helvetica-Bold').text('Billed To:', 50, topOffset);
      doc.font('Helvetica').text(`Student Name: ${student?.name || 'N/A'}`, 50, topOffset + 15);
      doc.text(`Admission No: ${student?.customId || 'N/A'}`, 50, topOffset + 30);
      
      // Right side: Payment Info
      doc.font('Helvetica-Bold').text('Receipt Details:', 350, topOffset);
      doc.font('Helvetica').text(`Receipt No: ${transaction.receiptNumber || 'N/A'}`, 350, topOffset + 15);
      doc.text(`Date: ${new Date(transaction.completedAt || transaction.createdAt).toLocaleDateString()}`, 350, topOffset + 30);
      doc.text(`Status: ${transaction.status}`, 350, topOffset + 45);

      doc.moveDown(4);

      // 4. Transaction Details
      const tableTop = 270;
      
      // Table Header
      doc.font('Helvetica-Bold');
      doc.text('Description', 50, tableTop);
      doc.text('Payment Method', 250, tableTop);
      doc.text('Ref ID', 380, tableTop);
      doc.text('Amount', 450, tableTop, { align: 'right' });
      
      doc.strokeColor('#eeeeee').lineWidth(1).moveTo(50, tableTop + 15).lineTo(545, tableTop + 15).stroke();

      // Table Row
      doc.font('Helvetica');
      doc.text(transaction.description || 'School Fee Payment', 50, tableTop + 25, { width: 190 });
      doc.text(transaction.provider || 'N/A', 250, tableTop + 25);
      doc.text(transaction.referenceNumber || 'N/A', 380, tableTop + 25, { width: 60 });
      doc.text(`${transaction.amount} ${transaction.currency || 'USD'}`, 450, tableTop + 25, { align: 'right' });

      doc.strokeColor('#eeeeee').lineWidth(1).moveTo(50, tableTop + 50).lineTo(545, tableTop + 50).stroke();

      // Total
      doc.font('Helvetica-Bold').fontSize(12);
      doc.text('Total Paid:', 350, tableTop + 65);
      doc.text(`${transaction.amount} ${transaction.currency || 'USD'}`, 450, tableTop + 65, { align: 'right' });

      // 5. QR Code Verification (Bottom Left)
      try {
        const verifyUrl = `${process.env.FRONTEND_URL || 'https://school.com'}/verify-receipt/${transaction.receiptNumber}`;
        const qrCodeDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1 });
        const qrBuffer = Buffer.from(qrCodeDataUrl.split(',')[1], 'base64');
        doc.image(qrBuffer, 50, 650, { width: 80 });
        doc.fontSize(8).font('Helvetica').text('Scan to verify', 55, 735);
      } catch (e) {
        console.warn('Could not generate QR Code:', e.message);
      }

      // Footer
      doc.fontSize(10).font('Helvetica-Oblique');
      doc.text('Thank you for your payment.', 50, 700, { align: 'center' });
      doc.text('This is an electronically generated receipt and does not require a physical signature.', 50, 715, { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

export default generateReceiptPdf;
