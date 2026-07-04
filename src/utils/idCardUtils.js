import crypto from 'crypto';

/**
 * Generate custom ID card number based on school settings
 */
export const generateCardNumber = async (school, type, branch = null) => {
  const format = type === 'student' 
    ? (school.settings?.idCard?.studentFormat || 'DKB-{YEAR}-{SEQUENCE}')
    : (school.settings?.idCard?.teacherFormat || 'EMP-{YEAR}-{SEQUENCE}');
  
  const sequencePadding = school.settings?.idCard?.sequencePadding || 6;
  const year = new Date().getFullYear();
  
  // Get next sequence number
  const sequence = await getNextSequence(school._id, type, sequencePadding);
  
  // Replace placeholders
  let cardNumber = format
    .replace(/{YEAR}/g, year.toString())
    .replace(/{SEQUENCE}/g, sequence)
    .replace(/{SCHOOL_CODE}/g, school.code || school.subdomain?.substring(0, 3).toUpperCase() || 'SCH')
    .replace(/{SCHOOL_NAME}/g, school.name?.substring(0, 3).toUpperCase() || 'SCH');
  
  if (branch) {
    cardNumber = cardNumber
      .replace(/{BRANCH_CODE}/g, branch.code || branch.name?.substring(0, 3).toUpperCase() || 'BR0')
      .replace(/{BRANCH_NAME}/g, branch.name?.substring(0, 3).toUpperCase() || 'BR0');
  }
  
  return cardNumber;
};

/**
 * Get next sequence number
 */
const getNextSequence = async (schoolId, type, padding) => {
  const IDCard = (await import('../models/IDCard.js')).default;
  
  // Find the last card for this school and type
  const lastCard = await IDCard.findOne({
    school: schoolId,
    type,
    cardNumber: { $exists: true }
  }).sort({ createdAt: -1 });
  
  let nextNumber = 1;
  
  if (lastCard) {
    // Try to extract sequence from last card number
    const match = lastCard.cardNumber.match(/(\d+)$/);
    if (match) {
      nextNumber = parseInt(match[1]) + 1;
    }
  }
  
  // Pad with zeros
  return nextNumber.toString().padStart(padding, '0');
};

/**
 * Generate verification token
 */
export const generateVerificationToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Generate QR code data string
 */
export const generateQrDataString = (idCard, school) => {
  const qrData = {
    cardNumber: idCard.cardNumber,
    verificationToken: idCard.verificationToken,
    userId: idCard.user.toString(),
    schoolId: idCard.school.toString(),
    tenantId: idCard.school.toString(),
    branchId: idCard.branch ? idCard.branch.toString() : null,
    type: idCard.type,
    status: idCard.status,
    issueDate: idCard.issueDate.toISOString(),
    expiryDate: idCard.expiryDate ? idCard.expiryDate.toISOString() : null,
    generatedAt: new Date().toISOString(),
    verificationUrl: idCard.verificationUrl || 
      (school?.settings?.idCard?.verificationBaseUrl 
        ? `${school.settings.idCard.verificationBaseUrl}/verify/${idCard.verificationToken}`
        : null)
  };
  
  return JSON.stringify(qrData);
};

/**
 * Create user snapshot for ID card
 */
export const createUserSnapshot = (user) => {
  return {
    name: user.name,
    customId: user.customId,
    email: user.email,
    phone: user.phone,
    photo: user.photo || user.profileImage,
    class: user.class,
    section: user.section,
    branch: user.branch,
    role: user.role,
    address: user.address,
    bloodGroup: user.bloodGroup,
    emergencyContact: user.emergencyContact,
    dateOfBirth: user.dateOfBirth
  };
};

/**
 * Create school snapshot for ID card
 */
export const createSchoolSnapshot = (school) => {
  return {
    name: school.name,
    logo: school.logo,
    address: school.address,
    phone: school.phone,
    email: school.email,
    website: school.website,
    signature: school.signature,
    stamp: school.stamp
  };
};

/**
 * Generate HTML for ID card preview (CR80 size: 85.60mm × 53.98mm = 320px × 200px at 96dpi)
 */
export const generateIDCardHTML = (idCard, design, school) => {
  const width = design.layout === 'portrait' ? '320px' : '510px';
  const height = design.layout === 'portrait' ? '510px' : '320px';
  const user = idCard.userSnapshot || {};
  const schoolData = idCard.schoolSnapshot || school || {};
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>ID Card - ${user.name || 'Student'}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'Arial', sans-serif; 
          background: #f0f0f0;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          padding: 20px;
        }
        .card-container {
          display: flex;
          flex-direction: ${design.layout === 'portrait' ? 'column' : 'row'};
          gap: 20px;
        }
        .card {
          width: ${width};
          height: ${height};
          background: ${design.backgroundColor};
          border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          overflow: hidden;
          position: relative;
        }
        .card-front, .card-back {
          width: 100%;
          height: 100%;
          padding: 16px;
          position: relative;
        }
        .card-header {
          background: linear-gradient(135deg, ${design.primaryColor}, ${design.secondaryColor});
          color: white;
          padding: 12px;
          text-align: center;
          border-radius: 8px;
          margin-bottom: 12px;
        }
        .school-logo {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          object-fit: cover;
          margin: 0 auto 8px;
          display: ${design.showSchoolLogo ? 'block' : 'none'};
        }
        .school-name {
          font-size: 16px;
          font-weight: bold;
          margin-bottom: 4px;
        }
        .card-title {
          font-size: 14px;
          opacity: 0.9;
        }
        .photo-container {
          text-align: center;
          margin: 12px 0;
        }
        .student-photo {
          width: 100px;
          height: 120px;
          object-fit: cover;
          border: 3px solid ${design.primaryColor};
          border-radius: 8px;
        }
        .student-name {
          font-size: 18px;
          font-weight: bold;
          text-align: center;
          color: ${design.textColor};
          margin: 8px 0 4px;
        }
        .card-number {
          text-align: center;
          font-size: 14px;
          color: ${design.textColor};
          opacity: 0.8;
          font-family: monospace;
        }
        .details-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 12px;
          font-size: 12px;
        }
        .detail-item {
          color: ${design.textColor};
        }
        .detail-label {
          font-size: 10px;
          opacity: 0.7;
          text-transform: uppercase;
          margin-bottom: 2px;
        }
        .detail-value {
          font-weight: 600;
        }
        .qr-section {
          position: absolute;
          ${design.qrPosition === 'top-left' ? 'top: 16px; left: 16px;' : ''}
          ${design.qrPosition === 'top-right' ? 'top: 16px; right: 16px;' : ''}
          ${design.qrPosition === 'bottom-left' ? 'bottom: 16px; left: 16px;' : ''}
          ${design.qrPosition === 'bottom-right' ? 'bottom: 16px; right: 16px;' : ''}
          display: ${design.showQrCode ? 'block' : 'none'};
        }
        .qr-code {
          width: ${design.qrSize}px;
          height: ${design.qrSize}px;
          background: white;
          padding: 4px;
          border-radius: 4px;
        }
        .card-footer {
          position: absolute;
          bottom: 16px;
          left: 16px;
          right: 16px;
          text-align: center;
          font-size: 10px;
          color: ${design.textColor};
          opacity: 0.7;
        }
        .signature-section {
          margin-top: 16px;
          text-align: center;
          display: ${design.showPrincipalSignature ? 'block' : 'none'};
        }
        .signature-line {
          border-top: 1px solid ${design.textColor};
          width: 120px;
          margin: 4px auto 0;
          padding-top: 4px;
          font-size: 10px;
        }
        .back-content {
          font-size: 11px;
          color: ${design.textColor};
        }
        .terms-section {
          background: rgba(0,0,0,0.05);
          padding: 12px;
          border-radius: 8px;
          margin-bottom: 12px;
        }
        .contact-section {
          text-align: center;
          font-size: 10px;
        }
      </style>
    </head>
    <body>
      <div class="card-container">
        <!-- Front Side -->
        <div class="card">
          <div class="card-front">
            <div class="card-header">
              ${schoolData.logo ? `<img src="${schoolData.logo.url || schoolData.logo}" class="school-logo" alt="School Logo">` : ''}
              <div class="school-name">${schoolData.name || 'School'}</div>
              <div class="card-title">${idCard.type.toUpperCase()} ID CARD</div>
            </div>
            
            <div class="photo-container">
              ${user.photo ? `<img src="${user.photo.url || user.photo}" class="student-photo" alt="Photo">` : '<div class="student-photo" style="background: #e0e7ff; display: flex; align-items: center; justify-content: center; color: #4f46e5; font-size: 40px;">📷</div>'}
            </div>
            
            <div class="student-name">${user.name || 'Student Name'}</div>
            <div class="card-number">${idCard.cardNumber}</div>
            
            <div class="details-grid">
              ${user.class ? `<div class="detail-item"><div class="detail-label">Class</div><div class="detail-value">${user.class.name || user.class}</div></div>` : ''}
              ${user.section ? `<div class="detail-item"><div class="detail-label">Section</div><div class="detail-value">${user.section}</div></div>` : ''}
              ${user.rollNumber || idCard.rollNumber ? `<div class="detail-item"><div class="detail-label">Roll No</div><div class="detail-value">${user.rollNumber || idCard.rollNumber}</div></div>` : ''}
              ${user.customId ? `<div class="detail-item"><div class="detail-label">Student ID</div><div class="detail-value">${user.customId}</div></div>` : ''}
              <div class="detail-item"><div class="detail-label">Valid From</div><div class="detail-value">${new Date(idCard.issueDate).toLocaleDateString()}</div></div>
              <div class="detail-item"><div class="detail-label">Valid Until</div><div class="detail-value">${new Date(idCard.expiryDate).toLocaleDateString()}</div></div>
            </div>
            
            <div class="signature-section">
              <div class="signature-line">Principal</div>
            </div>
            
            <div class="qr-section">
              <div class="qr-code">
                <!-- QR Code placeholder - would be replaced with actual QR code -->
                <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 8px; text-align: center; color: #666;">
                  QR<br>Code
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Back Side -->
        <div class="card">
          <div class="card-back back-content">
            <div class="terms-section">
              <strong>Terms & Conditions:</strong>
              <p style="margin-top: 8px; line-height: 1.4;">${design.termsAndConditions}</p>
            </div>
            
            <div class="details-grid" style="margin-top: 16px;">
              ${user.address ? `<div class="detail-item"><div class="detail-label">Address</div><div class="detail-value">${user.address}</div></div>` : ''}
              ${user.phone ? `<div class="detail-item"><div class="detail-label">Phone</div><div class="detail-value">${user.phone}</div></div>` : ''}
              ${user.bloodGroup ? `<div class="detail-item"><div class="detail-label">Blood Group</div><div class="detail-value">${user.bloodGroup}</div></div>` : ''}
              ${user.emergencyContact ? `<div class="detail-item"><div class="detail-label">Emergency</div><div class="detail-value">${user.emergencyContact}</div></div>` : ''}
            </div>
            
            <div class="contact-section">
              ${schoolData.phone ? `<p>📞 ${schoolData.phone}</p>` : ''}
              ${schoolData.email ? `<p>✉️ ${schoolData.email}</p>` : ''}
              ${schoolData.website ? `<p>🌐 ${schoolData.website}</p>` : ''}
              ${schoolData.address ? `<p>📍 ${schoolData.address}</p>` : ''}
            </div>
            
            <div class="card-footer">
              ${design.footerText || 'If found, please return to school office'}
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
};

export default {
  generateCardNumber,
  generateVerificationToken,
  generateQrDataString,
  createUserSnapshot,
  createSchoolSnapshot,
  generateIDCardHTML
};
