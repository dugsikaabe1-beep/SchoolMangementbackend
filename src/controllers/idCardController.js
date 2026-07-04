import IDCard from '../models/IDCard.js';
import IDCardDesign from '../models/IDCardDesign.js';
import User from '../models/User.js';
import School from '../models/School.js';
import Branch from '../models/Branch.js';
import { logAction } from '../utils/auditLogger.js';
import {
  generateCardNumber,
  generateVerificationToken,
  generateQrDataString,
  createUserSnapshot,
  createSchoolSnapshot,
  generateIDCardHTML
} from '../utils/idCardUtils.js';

// Generate ID Card
export const generateIDCard = async (req, res) => {
  try {
    const { userId, type, expiryDate, designId, notes, rollNumber, admissionNumber, employeeId } = req.body;
    const schoolId = req.school?._id || req.schoolId;
    const branchId = req.branch?._id || req.branchId;

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Find school
    const school = await School.findById(schoolId);
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found' });
    }

    // Find branch if needed
    let branch = null;
    if (branchId) {
      branch = await Branch.findById(branchId);
    }

    // Check if user already has an active ID card of this type
    const existingCard = await IDCard.findOne({
      school: schoolId,
      user: userId,
      type,
      status: 'active',
    });
    if (existingCard) {
      return res.status(400).json({
        success: false,
        message: 'User already has an active ID card of this type',
      });
    }

    // Get design if provided, or use default
    let design = null;
    if (designId) {
      design = await IDCardDesign.findById(designId);
    } else {
      // Find default design for this type
      design = await IDCardDesign.findOne({
        school: schoolId,
        type,
        isDefault: true,
        isActive: true
      });
      // If no default, use first active
      if (!design) {
        design = await IDCardDesign.findOne({
          school: schoolId,
          type,
          isActive: true
        });
      }
    }

    // Generate custom card number
    const cardNumber = await generateCardNumber(school, type, branch);
    
    // Calculate expiry date if not provided
    let finalExpiryDate = expiryDate;
    if (!finalExpiryDate) {
      const validityYears = school.settings?.idCard?.defaultValidityYears || 1;
      finalExpiryDate = new Date();
      finalExpiryDate.setFullYear(finalExpiryDate.getFullYear() + validityYears);
    }

    // Create ID card
    const idCard = new IDCard({
      school: schoolId,
      branch: branchId || user.branch,
      user: userId,
      type,
      cardNumber,
      rollNumber,
      admissionNumber,
      employeeId,
      verificationToken: generateVerificationToken(),
      issueDate: new Date(),
      expiryDate: finalExpiryDate,
      design: design?._id,
      notes,
      createdBy: req.user?._id,
      // Create snapshots
      userSnapshot: createUserSnapshot(user),
      schoolSnapshot: createSchoolSnapshot(school)
    });

    // Generate QR data
    idCard.generateQrData(school);
    
    // Set verification URL if configured
    if (school.settings?.idCard?.verificationBaseUrl) {
      idCard.verificationUrl = `${school.settings.idCard.verificationBaseUrl}/verify/${idCard.verificationToken}`;
    }

    await idCard.save();

    // Populate for response
    await idCard.populate('user school branch design');

    // Log action
    await logAction(req, {
      action: 'ID_CARD_GENERATED',
      module: 'IDCards',
      details: { userId, type, cardNumber },
      targetId: idCard._id,
      newValue: { cardNumber, type, userId },
    });

    res.status(201).json({
      success: true,
      message: 'ID card generated successfully',
      data: idCard,
    });
  } catch (error) {
    console.error('Error generating ID card:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate ID card',
      error: error.message,
    });
  }
};

// Get all ID cards for a school
export const getIDCards = async (req, res) => {
  try {
    const schoolId = req.school?._id || req.schoolId;
    const { status, type, branchId, search } = req.query;

    const filter = { school: schoolId };
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (branchId) filter.branch = branchId;

    // Search by card number or user name
    if (search) {
      const users = await User.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { customId: { $regex: search, $options: 'i' } },
        ],
      }).select('_id');
      const userIds = users.map(u => u._id);

      filter.$or = [
        { cardNumber: { $regex: search, $options: 'i' } },
        { user: { $in: userIds } },
      ];
    }

    const idCards = await IDCard.find(filter)
      .populate('user school branch design')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: idCards,
    });
  } catch (error) {
    console.error('Error fetching ID cards:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ID cards',
      error: error.message,
    });
  }
};

// Get ID card by ID
export const getIDCardById = async (req, res) => {
  try {
    const { id } = req.params;
    const schoolId = req.school?._id || req.schoolId;

    const idCard = await IDCard.findOne({ _id: id, school: schoolId }).populate(
      'user school branch design'
    );

    if (!idCard) {
      return res.status(404).json({
        success: false,
        message: 'ID card not found',
      });
    }

    res.json({
      success: true,
      data: idCard,
    });
  } catch (error) {
    console.error('Error fetching ID card:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ID card',
      error: error.message,
    });
  }
};

// Verify ID card (public endpoint for QR scanning)
export const verifyIDCard = async (req, res) => {
  try {
    const { token } = req.params;

    const idCard = await IDCard.findOne({ verificationToken: token }).populate(
      'user school branch'
    );

    if (!idCard) {
      return res.status(404).json({
        success: false,
        valid: false,
        message: 'ID card not found or invalid',
      });
    }

    // Check if ID card is active
    const now = new Date();
    let status = idCard.status;
    if (status === 'active' && idCard.expiryDate && now > idCard.expiryDate) {
      status = 'expired';
    }

    const isValid = status === 'active';

    res.json({
      success: true,
      valid: isValid,
      status,
      data: {
        cardNumber: idCard.cardNumber,
        issueDate: idCard.issueDate,
        expiryDate: idCard.expiryDate,
        school: idCard.school
          ? {
              name: idCard.school.name,
              logo: idCard.school.logo,
            }
          : null,
        branch: idCard.branch
          ? {
              name: idCard.branch.name,
            }
          : null,
        user: idCard.user
          ? {
              name: idCard.user.name,
              customId: idCard.user.customId,
              profileImage: idCard.user.profileImage,
              role: idCard.user.role,
              class: idCard.user.class,
            }
          : null,
      },
    });
  } catch (error) {
    console.error('Error verifying ID card:', error);
    res.status(500).json({
      success: false,
      valid: false,
      message: 'Failed to verify ID card',
      error: error.message,
    });
  }
};

// Update ID card status
export const updateIDCardStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    const schoolId = req.school?._id || req.schoolId;

    const idCard = await IDCard.findOne({ _id: id, school: schoolId });
    if (!idCard) {
      return res.status(404).json({
        success: false,
        message: 'ID card not found',
      });
    }

    const oldValue = { status: idCard.status, notes: idCard.notes };
    idCard.status = status;
    if (notes !== undefined) idCard.notes = notes;
    idCard.updatedBy = req.user?._id;
    await idCard.save();

    // Log action
    await logAction(req, {
      action: 'ID_CARD_STATUS_UPDATED',
      module: 'IDCards',
      details: { oldStatus: oldValue.status, newStatus: status },
      targetId: idCard._id,
      oldValue,
      newValue: { status, notes },
    });

    await idCard.populate('user school branch design');

    res.json({
      success: true,
      message: 'ID card status updated',
      data: idCard,
    });
  } catch (error) {
    console.error('Error updating ID card status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update ID card status',
      error: error.message,
    });
  }
};

// Mark ID card as printed
export const markAsPrinted = async (req, res) => {
  try {
    const { id } = req.params;
    const schoolId = req.school?._id || req.schoolId;

    const idCard = await IDCard.findOne({ _id: id, school: schoolId });
    if (!idCard) {
      return res.status(404).json({
        success: false,
        message: 'ID card not found',
      });
    }

    idCard.printed = true;
    idCard.printedAt = new Date();
    idCard.printedBy = req.user?._id;
    await idCard.save();

    await logAction(req, {
      action: 'ID_CARD_PRINTED',
      module: 'IDCards',
      targetId: idCard._id,
    });

    await idCard.populate('user school branch design');

    res.json({
      success: true,
      message: 'ID card marked as printed',
      data: idCard,
    });
  } catch (error) {
    console.error('Error marking ID card as printed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark ID card as printed',
      error: error.message,
    });
  }
};

// Delete ID card (soft delete)
export const deleteIDCard = async (req, res) => {
  try {
    const { id } = req.params;
    const schoolId = req.school?._id || req.schoolId;

    const idCard = await IDCard.findOne({ _id: id, school: schoolId });
    if (!idCard) {
      return res.status(404).json({
        success: false,
        message: 'ID card not found',
      });
    }

    // Mark as inactive instead of deleting
    idCard.status = 'inactive';
    idCard.updatedBy = req.user?._id;
    await idCard.save();

    await logAction(req, {
      action: 'ID_CARD_DEACTIVATED',
      module: 'IDCards',
      targetId: idCard._id,
    });

    res.json({
      success: true,
      message: 'ID card deactivated successfully',
    });
  } catch (error) {
    console.error('Error deleting ID card:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete ID card',
      error: error.message,
    });
  }
};

// ID Card Design CRUD
export const createIDCardDesign = async (req, res) => {
  try {
    const schoolId = req.school?._id || req.schoolId;
    const designData = { ...req.body, school: schoolId };

    const design = new IDCardDesign(designData);
    await design.save();

    await logAction(req, {
      action: 'ID_CARD_DESIGN_CREATED',
      module: 'IDCards',
      targetId: design._id,
      newValue: design,
    });

    res.status(201).json({
      success: true,
      message: 'ID card design created',
      data: design,
    });
  } catch (error) {
    console.error('Error creating ID card design:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create ID card design',
      error: error.message,
    });
  }
};

export const getIDCardDesigns = async (req, res) => {
  try {
    const schoolId = req.school?._id || req.schoolId;
    const { type } = req.query;
    
    const filter = { school: schoolId, isActive: true };
    if (type) filter.type = type;
    
    const designs = await IDCardDesign.find(filter).sort({
      isDefault: -1,
      createdAt: -1,
    });

    res.json({
      success: true,
      data: designs,
    });
  } catch (error) {
    console.error('Error fetching ID card designs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ID card designs',
      error: error.message,
    });
  }
};

// Update ID card design
export const updateIDCardDesign = async (req, res) => {
  try {
    const { id } = req.params;
    const schoolId = req.school?._id || req.schoolId;
    
    const design = await IDCardDesign.findOne({ _id: id, school: schoolId });
    if (!design) {
      return res.status(404).json({
        success: false,
        message: 'ID card design not found',
      });
    }

    // If setting as default, unset other defaults
    if (req.body.isDefault) {
      await IDCardDesign.updateMany(
        { school: schoolId, type: design.type, _id: { $ne: id } },
        { isDefault: false }
      );
    }

    Object.assign(design, req.body);
    design.updatedAt = new Date();
    await design.save();

    await logAction(req, {
      action: 'ID_CARD_DESIGN_UPDATED',
      module: 'IDCards',
      targetId: design._id,
    });

    res.json({
      success: true,
      message: 'ID card design updated',
      data: design,
    });
  } catch (error) {
    console.error('Error updating ID card design:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update ID card design',
      error: error.message,
    });
  }
};

// Delete ID card design
export const deleteIDCardDesign = async (req, res) => {
  try {
    const { id } = req.params;
    const schoolId = req.school?._id || req.schoolId;
    
    const design = await IDCardDesign.findOne({ _id: id, school: schoolId });
    if (!design) {
      return res.status(404).json({
        success: false,
        message: 'ID card design not found',
      });
    }

    design.isActive = false;
    await design.save();

    await logAction(req, {
      action: 'ID_CARD_DESIGN_DELETED',
      module: 'IDCards',
      targetId: design._id,
    });

    res.json({
      success: true,
      message: 'ID card design deleted',
    });
  } catch (error) {
    console.error('Error deleting ID card design:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete ID card design',
      error: error.message,
    });
  }
};

// Get ID card preview HTML
export const getIDCardPreview = async (req, res) => {
  try {
    const { id } = req.params;
    const schoolId = req.school?._id || req.schoolId;
    
    const idCard = await IDCard.findOne({ _id: id, school: schoolId })
      .populate('user school branch design');
    
    if (!idCard) {
      return res.status(404).json({
        success: false,
        message: 'ID card not found',
      });
    }

    const design = idCard.design || await IDCardDesign.findOne({
      school: schoolId,
      type: idCard.type,
      isDefault: true
    }) || {
      type: idCard.type,
      layout: 'portrait',
      primaryColor: '#4f46e5',
      secondaryColor: '#7c3aed',
      backgroundColor: '#ffffff',
      textColor: '#000000',
      showQrCode: true,
      qrPosition: 'bottom-right',
      qrSize: 40,
      showPrincipalSignature: true,
      showSchoolLogo: true,
      termsAndConditions: 'This card is the property of the school. If found, please return to the school office.'
    };

    const html = generateIDCardHTML(idCard, design, idCard.school);

    res.set('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error('Error generating ID card preview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate preview',
      error: error.message,
    });
  }
};

// Reprint ID card (create new version)
export const reprintIDCard = async (req, res) => {
  try {
    const { id } = req.params;
    const schoolId = req.school?._id || req.schoolId;
    
    const originalCard = await IDCard.findOne({ _id: id, school: schoolId });
    if (!originalCard) {
      return res.status(404).json({
        success: false,
        message: 'ID card not found',
      });
    }

    // Mark old card as inactive if needed
    if (originalCard.status === 'active') {
      originalCard.status = 'inactive';
      originalCard.statusReason = 'Reprinted';
      await originalCard.save();
    }

    // Create new card with same data but new token/number
    const school = await School.findById(schoolId);
    const branch = originalCard.branch ? await Branch.findById(originalCard.branch) : null;
    const newCardNumber = await generateCardNumber(school, originalCard.type, branch);

    const newCard = new IDCard({
      school: originalCard.school,
      branch: originalCard.branch,
      user: originalCard.user,
      type: originalCard.type,
      cardNumber: newCardNumber,
      rollNumber: originalCard.rollNumber,
      admissionNumber: originalCard.admissionNumber,
      employeeId: originalCard.employeeId,
      verificationToken: generateVerificationToken(),
      issueDate: new Date(),
      expiryDate: originalCard.expiryDate,
      design: originalCard.design,
      notes: 'Reprint of: ' + originalCard.cardNumber,
      createdBy: req.user?._id,
      userSnapshot: originalCard.userSnapshot,
      schoolSnapshot: originalCard.schoolSnapshot,
    });

    newCard.generateQrData(school);
    if (school.settings?.idCard?.verificationBaseUrl) {
      newCard.verificationUrl = `${school.settings.idCard.verificationBaseUrl}/verify/${newCard.verificationToken}`;
    }

    await newCard.save();
    await newCard.populate('user school branch design');

    await logAction(req, {
      action: 'ID_CARD_REPRINTED',
      module: 'IDCards',
      details: { originalCardId: originalCard._id, newCardNumber },
      targetId: newCard._id,
    });

    res.status(201).json({
      success: true,
      message: 'ID card reprinted successfully',
      data: newCard,
    });
  } catch (error) {
    console.error('Error reprinting ID card:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reprint ID card',
      error: error.message,
    });
  }
};

// Get ID card by user
export const getIDCardsByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const schoolId = req.school?._id || req.schoolId;

    const idCards = await IDCard.find({
      school: schoolId,
      user: userId
    })
      .populate('user school branch design')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: idCards,
    });
  } catch (error) {
    console.error('Error fetching user ID cards:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ID cards',
      error: error.message,
    });
  }
};

export default {
  generateIDCard,
  getIDCards,
  getIDCardById,
  verifyIDCard,
  updateIDCardStatus,
  markAsPrinted,
  deleteIDCard,
  createIDCardDesign,
  getIDCardDesigns,
  updateIDCardDesign,
  deleteIDCardDesign,
  getIDCardPreview,
  reprintIDCard,
  getIDCardsByUser,
};
