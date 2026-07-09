import crypto from 'crypto';
import axios from 'axios';
import QRCode from 'qrcode';

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
        : null),
    name: idCard.userSnapshot?.name || idCard.user?.name,
    motherName: idCard.userSnapshot?.motherName || idCard.user?.motherName,
    grade: idCard.userSnapshot?.class?.name || idCard.userSnapshot?.class || idCard.user?.class?.name || idCard.user?.class,
    image: idCard.userSnapshot?.photo?.url || idCard.userSnapshot?.photo || idCard.user?.profileImage?.url || idCard.user?.profileImage
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
    dateOfBirth: user.dateOfBirth,
    motherName: user.motherName
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

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const inferMimeType = (url = '') => {
  const normalizedUrl = url.toLowerCase();

  if (normalizedUrl.includes('.png')) return 'image/png';
  if (normalizedUrl.includes('.webp')) return 'image/webp';
  if (normalizedUrl.includes('.gif')) return 'image/gif';
  if (normalizedUrl.includes('.svg')) return 'image/svg+xml';

  return 'image/jpeg';
};

const resolveAssetSource = (asset) => {
  if (!asset) return null;
  return typeof asset === 'string' ? asset : asset.url || null;
};

const toPrintableAsset = async (asset) => {
  const source = resolveAssetSource(asset);

  if (!source) return null;
  if (source.startsWith('data:')) return source;

  try {
    const response = await axios.get(source, {
      responseType: 'arraybuffer',
      timeout: 15000,
    });

    const mimeType = response.headers['content-type'] || inferMimeType(source);
    const base64 = Buffer.from(response.data).toString('base64');
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error('Failed to embed ID card asset for printing:', source, error.message);
    return source;
  }
};

/**
 * Generate HTML for ID card preview (CR80 size: 85.60mm × 53.98mm = 320px × 200px at 96dpi)
 */
export const generateIDCardHTML = async (idCard, design, school) => {
  const user = idCard.userSnapshot || {};
  const schoolData = idCard.schoolSnapshot || school || {};
  const qrPayload = idCard.qrCodeData || generateQrDataString(idCard, school);
  const qrValue = typeof qrPayload === 'string' ? qrPayload : JSON.stringify(qrPayload);

  const [schoolLogoSrc, userPhotoSrc, qrCodeSrc] = await Promise.all([
    toPrintableAsset(schoolData.logo),
    toPrintableAsset(user.photo),
    QRCode.toDataURL(qrValue, {
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 200,
      color: {
        dark: '#1e293b',
        light: '#ffffff',
      },
    }),
  ]);

  const cardHolderName = escapeHtml(user.name || 'Student Name');
  const schoolName = escapeHtml(schoolData.name || 'School');
  const cardType = escapeHtml(
    idCard.type ? idCard.type.charAt(0).toUpperCase() + idCard.type.slice(1) : 'Student'
  );
  const cardNumber = escapeHtml(user.customId || idCard.cardNumber || '');
  const className = user.class?.name || idCard.user?.class?.name || user.class;
  const phone = user.phone ? escapeHtml(user.phone) : '';
  const expiryDate = idCard.expiryDate ? escapeHtml(new Date(idCard.expiryDate).toLocaleDateString()) : '';
  const schoolPhone = schoolData.phone ? escapeHtml(schoolData.phone) : '';
  const schoolEmail = schoolData.email ? escapeHtml(schoolData.email) : '';
  const schoolWebsite = schoolData.website ? escapeHtml(schoolData.website) : '';
  
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
          flex-direction: column;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          padding: 20px;
        }
        .card-container {
          display: flex;
          flex-direction: column;
          gap: 40px;
        }
        .card {
          width: 510px; /* CR80 landscape width */
          height: 320px; /* CR80 landscape height */
          background: white;
          border-radius: 15px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          overflow: hidden;
          position: relative;
          border: 2px solid #1e40af;
        }
        /* Front Side Styles */
        .front-header {
          background: linear-gradient(90deg, #1e40af 0%, #3b82f6 100%);
          padding: 10px 15px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .front-header-content {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .front-school-name {
          color: white;
          font-size: 14px;
          font-weight: bold;
        }
        .front-header-arabic {
          color: white;
          font-size: 14px;
          font-weight: bold;
        }
        .front-body {
          padding: 10px 15px;
          display: flex;
          gap: 15px;
        }
        .photo-section {
          flex-shrink: 0;
        }
        .student-photo {
          width: 120px;
          height: 140px;
          object-fit: cover;
          border: 2px solid #1e40af;
          border-radius: 8px;
        }
        .info-section {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .student-label {
          background: #1e40af;
          color: white;
          padding: 3px 10px;
          font-weight: bold;
          font-size: 14px;
          border-radius: 5px 5px 0 0;
          display: inline-block;
        }
        .info-box {
          background: white;
          border: 2px solid #1e40af;
          border-radius: 0 5px 5px 5px;
          padding: 8px 10px;
        }
        .info-row {
          display: flex;
          font-size: 12px;
          margin-bottom: 3px;
        }
        .info-label {
          font-weight: bold;
          color: #1e40af;
          width: 80px;
        }
        .info-value {
          flex: 1;
        }
        .bottom-logo {
          position: absolute;
          bottom: 10px;
          left: 15px;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid #1e40af;
        }
        /* Back Side Styles */
        .back-header {
          background: linear-gradient(90deg, #1e40af 0%, #3b82f6 100%);
          padding: 10px 15px;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        .back-body {
          padding: 15px;
          display: flex;
          justify-content: space-between;
        }
        .back-left {
          flex: 1;
          padding-right: 10px;
        }
        .back-text {
          font-size: 11px;
          margin-bottom: 10px;
          line-height: 1.5;
        }
        .back-contact {
          font-size: 11px;
          line-height: 1.8;
        }
        .back-qr {
          width: 100px;
          height: 100px;
          background: white;
          border: 1px solid #ddd;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          text-align: center;
          color: #666;
          flex-shrink: 0;
          overflow: visible;
          position: relative;
          z-index: 5;
        }
        .back-qr img,
        .back-qr svg,
        .back-qr canvas {
          width: 100px !important;
          height: 100px !important;
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          object-fit: contain;
        }
        img, svg, canvas {
          max-width: 100%;
        }
        /* Print Styles */
        @media print {
          body {
            background: white;
            padding: 0;
            margin: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .card-container {
            gap: 0;
            flex-direction: column;
            align-items: flex-start;
          }
          .card {
            box-shadow: none;
            border-radius: 0;
            border: none;
            overflow: visible;
          }
          .back-body,
          .back-left,
          .back-qr {
            overflow: visible !important;
          }
          .back-qr,
          .back-qr img,
          .back-qr svg,
          .back-qr canvas {
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
          }
          @page {
            size: auto;
            margin: 0;
          }
        }
      </style>
      <script>
        window.__PRINT_READY__ = false;

        (async () => {
          const waitForImages = async () => {
            const images = Array.from(document.images);

            await Promise.all(
              images.map((image) => {
                if (image.complete) {
                  return Promise.resolve();
                }

                return new Promise((resolve) => {
                  const done = () => resolve();
                  image.addEventListener('load', done, { once: true });
                  image.addEventListener('error', done, { once: true });
                });
              })
            );
          };

          try {
            if (document.fonts && document.fonts.ready) {
              await document.fonts.ready;
            }

            await waitForImages();
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          } finally {
            window.__PRINT_READY__ = true;
            document.documentElement.setAttribute('data-print-ready', 'true');
          }
        })();
      </script>
    </head>
    <body>
      <div class="card-container">
        <!-- Front Side -->
        <div class="card">
          <div class="front-header">
            <div class="front-header-content">
              ${schoolLogoSrc ? `<img src="${schoolLogoSrc}" style="width:45px;height:45px;border-radius:50%;object-fit:cover;border:2px solid white;" alt="${schoolName} Logo">` : ''}
              <span class="front-school-name">${schoolName}</span>
            </div>
            <span class="front-header-arabic">جامعة جمهورية</span>
          </div>
          <div class="front-body">
            <div class="photo-section">
              ${userPhotoSrc ? `<img src="${userPhotoSrc}" class="student-photo" alt="${cardHolderName} Photo">` : '<div class="student-photo" style="background: #dbeafe; display: flex; align-items: center; justify-content: center; color: #1e40af; font-size: 50px;">?</div>'}
            </div>
            <div class="info-section">
              <span class="student-label">${cardType}</span>
              <div class="info-box">
                <div class="info-row">
                  <span class="info-label">Name:</span>
                  <span class="info-value">${cardHolderName}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">ID No:</span>
                  <span class="info-value">${cardNumber}</span>
                </div>
                ${className ? `<div class="info-row">
                  <span class="info-label">Class:</span>
                  <span class="info-value">${escapeHtml(className)}</span>
                </div>` : ''}
                ${phone ? `<div class="info-row">
                  <span class="info-label">Mobile:</span>
                  <span class="info-value">${phone}</span>
                </div>` : ''}
                <div class="info-row">
                  <span class="info-label">Expires:</span>
                  <span class="info-value">${expiryDate}</span>
                </div>
              </div>
            </div>
          </div>
          ${schoolLogoSrc ? `<img src="${schoolLogoSrc}" class="bottom-logo" alt="${schoolName} Logo">` : ''}
        </div>
        
        <!-- Back Side -->
        <div class="card">
          <div class="back-header">
            ${schoolLogoSrc ? `<img src="${schoolLogoSrc}" style="width:70px;height:70px;border-radius:50%;object-fit:cover;border:3px solid white;" alt="${schoolName} Logo">` : ''}
          </div>
          <div class="back-body">
            <div class="back-left">
              <p class="back-text">If found please return to ${schoolName}.</p>
              <div class="back-contact">
                ${schoolPhone ? `<p>Tel: ${schoolPhone}</p>` : ''}
                ${schoolEmail ? `<p>Email: ${schoolEmail}</p>` : ''}
                ${schoolWebsite ? `<p>Website: ${schoolWebsite}</p>` : ''}
              </div>
            </div>
            <div class="back-qr">
              ${qrCodeSrc ? `<img src="${qrCodeSrc}" alt="QR Code">` : 'QR<br>Code'}
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
