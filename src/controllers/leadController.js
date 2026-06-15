import Lead from '../models/Lead.js';
import { logAction } from '../utils/auditLogger.js';

// --- Create a Lead (Public) ---
export const createLead = async (req, res) => {
  try {
    const { name, email, phone, schoolName, country, message, type } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        message: 'Missing required fields',
        userMessage: 'Name and email are required.'
      });
    }

    const lead = await Lead.create({
      name,
      email,
      phone,
      schoolName,
      country,
      message,
      type: type || 'contact'
    });

    res.status(201).json({
      message: 'Lead captured successfully',
      userMessage: 'Thank you for your interest! Our team will contact you shortly.',
      leadId: lead._id
    });
  } catch (error) {
    console.error('Create Lead Error:', error);
    res.status(500).json({
      message: 'Failed to capture lead',
      userMessage: 'An error occurred while submitting your request. Please try again.'
    });
  }
};

// --- Get All Leads (Super Admin) ---
export const getAllLeads = async (req, res) => {
  try {
    const { status, type, search, page = 1, limit = 20 } = req.query;

    const filter = { isDeleted: false };
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { schoolName: { $regex: search, $options: 'i' } }
      ];
    }

    const leads = await Lead.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Lead.countDocuments(filter);

    res.json({
      leads,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      total: count
    });
  } catch (error) {
    console.error('Get Leads Error:', error);
    res.status(500).json({
      message: 'Failed to fetch leads',
      userMessage: 'Failed to fetch leads. Please try again.'
    });
  }
};

// --- Update Lead Status ---
export const updateLeadStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body;

    const lead = await Lead.findById(id);
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    if (status) lead.status = status;
    if (note) {
      lead.notes.push({
        content: note,
        addedBy: req.user._id
      });
    }

    await lead.save();

    res.json({
      message: 'Lead updated successfully',
      lead
    });
  } catch (error) {
    console.error('Update Lead Error:', error);
    res.status(500).json({
      message: 'Failed to update lead',
      userMessage: 'Failed to update lead. Please try again.'
    });
  }
};
