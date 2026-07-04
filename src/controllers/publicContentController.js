import asyncHandler from 'express-async-handler';
import SchoolHome from '../models/SchoolHome.js';
import SchoolAbout from '../models/SchoolAbout.js';
import SchoolEvent from '../models/SchoolEvent.js';
import User from '../models/User.js';
import { broadcastNotification } from '../utils/notificationService.js';
import School from '../models/School.js';
import { uploadToCloudinary } from '../utils/cloudinary.js';
import fs from 'fs';
import mongoose from 'mongoose';
import Branch from '../models/Branch.js';

// --- Public Access ---

// @desc    Get all schools for selection
// @route   GET /api/public/schools
// @access  Public
export const getSchools = asyncHandler(async (req, res) => {
  const schools = await School.find({ isActive: true })
    .select('name logo code subdomain')
    .lean();

  const enriched = schools.map((s) => ({
    ...s,
    schoolId: s._id,
    tenantId: s.subdomain,
  }));

  res.json(enriched);
});

// @desc    Get all active branches for a school
// @route   GET /api/public/branches/:schoolId
// @access  Public
export const getPublicBranches = asyncHandler(async (req, res) => {
  const { schoolId } = req.params;

  if (!schoolId || !mongoose.Types.ObjectId.isValid(schoolId)) {
    return res.json([]);
  }

  const branches = await Branch.find({ 
    tenant: schoolId,
    status: 'active',
    deletedAt: { $exists: false }
  })
    .select('name code address city')
    .sort({ name: 1 })
    .lean();

  res.json(branches);
});

// @desc    Get public content for a school
// @route   GET /api/public/content/:schoolId?
// @access  Public
export const getPublicContent = asyncHandler(async (req, res) => {
  // Priority: 1. Header (req.schoolId), 2. Path Params (schoolId)
  const schoolId = req.schoolId || req.params.schoolId;

  console.log(`[PublicContent] Fetching content for SchoolID: ${schoolId}`);

  // Validate schoolId to prevent CastError
  if (!schoolId || !mongoose.Types.ObjectId.isValid(schoolId)) {
    console.log(`[PublicContent] Invalid SchoolID: ${schoolId}, returning default content`);
    return res.json({
      home: { heroTitle: 'Welcome to Our School', heroSubtitle: 'Providing quality education' },
      about: { history: 'Our school history...', mission: 'Our mission...', vision: 'Our vision...' },
      events: []
    });
  }

  const home = await SchoolHome.findOne({ school: schoolId });
  const about = await SchoolAbout.findOne({ school: schoolId });
  const events = await SchoolEvent.find({ school: schoolId }).sort({ date: 1 });

  console.log(`[PublicContent] Found content for ${schoolId}: Home=${!!home}, About=${!!about}, Events=${events.length}`);

  res.json({
    home: home || { heroTitle: 'Welcome to Our School', heroSubtitle: 'Providing quality education' },
    about: about || { history: 'Our school history...', mission: 'Our mission...', vision: 'Our vision...' },
    events: events || []
  });
});

// @desc    Get all events for a school
// @route   GET /api/public/events/:schoolId?
// @access  Public
export const getPublicEvents = asyncHandler(async (req, res) => {
  // Priority: 1. Header (req.schoolId), 2. Path Params (schoolId)
  const schoolId = req.schoolId || req.params.schoolId;

  // Validate schoolId to prevent CastError
  if (!schoolId || !mongoose.Types.ObjectId.isValid(schoolId)) {
    return res.json([]);
  }

  const events = await SchoolEvent.find({ school: schoolId }).sort({ date: 1 });
  res.json(events);
});

// --- Admin Access ---

// @desc    Update school home content
// @route   PUT /api/school-admin/public-content/home
// @access  Private (School Admin)
export const updateHomeContent = asyncHandler(async (req, res) => {
  const schoolId = req.user.school?._id || req.user.school;
  const { heroTitle, heroSubtitle, heroImage, motto, welcomeText, featuredImage } = req.body;

  let home = await SchoolHome.findOne({ school: schoolId });

  if (home) {
    home.heroTitle = heroTitle;
    home.heroSubtitle = heroSubtitle;
    home.heroImage = heroImage;
    home.motto = motto;
    home.welcomeText = welcomeText;
    home.featuredImage = featuredImage;
    await home.save();
  } else {
    home = await SchoolHome.create({
      school: schoolId,
      heroTitle: heroTitle || '',
      heroSubtitle,
      heroImage,
      motto,
      welcomeText,
      featuredImage
    });
  }

  res.json({
    message: 'Home content updated successfully',
    userMessage: 'Home content updated successfully',
    home
  });
});

// @desc    Update school about content
// @route   PUT /api/school-admin/public-content/about
// @access  Private (School Admin)
export const updateAboutContent = asyncHandler(async (req, res) => {
  const schoolId = req.user.school?._id || req.user.school;
  const { history, mission, vision, values, principalMessage, principalImage } = req.body;

  let about = await SchoolAbout.findOne({ school: schoolId });

  if (about) {
    about.history = history;
    about.mission = mission;
    about.vision = vision;
    about.values = values;
    about.principalMessage = principalMessage;
    about.principalImage = principalImage;
    await about.save();
  } else {
    about = await SchoolAbout.create({
      school: schoolId,
      history,
      mission,
      vision,
      values,
      principalMessage,
      principalImage
    });
  }

  res.json({
    message: 'About content updated successfully',
    userMessage: 'About content updated successfully',
    about
  });
});

// @desc    Create school event
// @route   POST /api/school-admin/public-content/events
// @access  Private (School Admin)
export const createEvent = asyncHandler(async (req, res) => {
  const schoolId = req.user.school?._id || req.user.school;
  const { title, description, date, location, image, type } = req.body;

  const event = await SchoolEvent.create({
    school: schoolId,
    title,
    description,
    date,
    location,
    image,
    type
  });

  // Notify all users in the school about the new event
  const recipients = await User.find({ school: schoolId, status: 'active' }).select('_id');
  if (recipients.length > 0) {
    await broadcastNotification({
      recipientIds: recipients.map(r => r._id),
      schoolId,
      title: `📅 New School Event: ${title}`,
      message: `A new event "${title}" has been scheduled for ${new Date(date).toLocaleDateString()}.`,
      type: 'announcement'
    });
  }

  res.status(201).json({
    message: 'Event created successfully',
    userMessage: 'Event created successfully',
    event
  });
});

// @desc    Update school event
// @route   PUT /api/school-admin/public-content/events/:id
// @access  Private (School Admin)
export const updateEvent = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const schoolId = req.user.school?._id || req.user.school;
  const { title, description, date, location, image, type } = req.body;

  const event = await SchoolEvent.findOne({ _id: id, school: schoolId });

  if (!event) {
    res.status(404);
    throw new Error('Event not found');
  }

  event.title = title || event.title;
  event.description = description || event.description;
  event.date = date || event.date;
  event.location = location || event.location;
  event.image = image || event.image;
  event.type = type || event.type;

  await event.save();

  res.json({
    message: 'Event updated successfully',
    userMessage: 'Event updated successfully',
    event
  });
});

// @desc    Delete school event
// @route   DELETE /api/school-admin/public-content/events/:id
// @access  Private (School Admin)
export const deleteEvent = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const schoolId = req.user.school?._id || req.user.school;

  const event = await SchoolEvent.findOneAndDelete({ _id: id, school: schoolId });

  if (!event) {
    res.status(404);
    throw new Error('Event not found');
  }

  res.json({
    message: 'Event deleted successfully',
    userMessage: 'Event deleted successfully'
  });
});
