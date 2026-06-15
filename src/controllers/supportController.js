import SupportTicket from '../models/SupportTicket.js';
import { logAction } from '../utils/auditLogger.js';
import { v4 as uuidv4 } from 'uuid';

// --- Create Support Ticket (School Admin) ---
export const createTicket = async (req, res) => {
  try {
    const { subject, description, type, priority } = req.body;

    if (!subject || !description) {
      return res.status(400).json({
        message: 'Missing required fields',
        userMessage: 'Subject and description are required.'
      });
    }

    const ticketId = `TKT-${Math.floor(1000 + Math.random() * 9000)}-${Date.now().toString().slice(-4)}`;

    const ticket = await SupportTicket.create({
      ticketId,
      school: req.user.school,
      user: req.user._id,
      subject,
      description,
      type: type || 'general',
      priority: priority || 'medium'
    });

    res.status(201).json({
      message: 'Ticket created successfully',
      userMessage: `Support ticket ${ticketId} has been created. Our support team will review it.`,
      ticket
    });
  } catch (error) {
    console.error('Create Ticket Error:', error);
    res.status(500).json({
      message: 'Failed to create ticket',
      userMessage: 'An error occurred while creating the support ticket. Please try again.'
    });
  }
};

// --- Get All Tickets (Super Admin or School Admin) ---
export const getTickets = async (req, res) => {
  try {
    const { status, priority, type, search, page = 1, limit = 20 } = req.query;

    const filter = { isDeleted: false };
    
    // If not Super Admin, only show school's tickets
    if (req.user.role !== 'superadmin' && req.user.role !== 'super_admin') {
      filter.school = req.user.school;
    }

    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (type) filter.type = type;
    if (search) {
      filter.$or = [
        { subject: { $regex: search, $options: 'i' } },
        { ticketId: { $regex: search, $options: 'i' } }
      ];
    }

    const tickets = await SupportTicket.find(filter)
      .populate('school', 'name subdomain')
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await SupportTicket.countDocuments(filter);

    res.json({
      tickets,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      total: count
    });
  } catch (error) {
    console.error('Get Tickets Error:', error);
    res.status(500).json({
      message: 'Failed to fetch tickets',
      userMessage: 'Failed to fetch support tickets. Please try again.'
    });
  }
};

// --- Respond to Ticket ---
export const respondToTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { content, status } = req.body;

    const ticket = await SupportTicket.findById(id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Authorization check
    const userSchoolId = req.user.school?._id || req.user.school;
    const ticketSchoolId = ticket.school?._id || ticket.school;
    
    if (req.user.role !== 'superadmin' && req.user.role !== 'super_admin' && 
        ticketSchoolId.toString() !== userSchoolId.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    ticket.responses.push({
      user: req.user._id,
      content,
      createdAt: new Date()
    });

    if (status) {
      ticket.status = status;
    } else if (req.user.role === 'superadmin' || req.user.role === 'super_admin') {
      ticket.status = 'waiting_for_user';
    } else {
      ticket.status = 'in_progress';
    }

    await ticket.save();

    res.json({
      message: 'Response added successfully',
      ticket
    });
  } catch (error) {
    console.error('Respond Ticket Error:', error);
    res.status(500).json({
      message: 'Failed to add response',
      userMessage: 'Failed to add response to the ticket. Please try again.'
    });
  }
};
