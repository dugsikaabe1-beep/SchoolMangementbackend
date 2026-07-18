import asyncHandler from 'express-async-handler';
import Homework from '../models/Homework.js';
import LessonPlan from '../models/LessonPlan.js';
import Curriculum from '../models/Curriculum.js';
import { tenantFilter } from '../utils/tenantQuery.js';
import { logAction } from '../utils/auditLogger.js';

const ok = (res, data = {}) => res.json({ success: true, ...data });
const err = (res, s, msg) => res.status(s).json({ success: false, message: msg });

// ── HOMEWORK ─────────────────────────────────────────────────────────────────

export const getHomeworks = asyncHandler(async (req, res) => {
  const filter = { ...tenantFilter(req), isDeleted: false };
  const { classId, subjectId, teacherId, status, page = 1, limit = 20 } = req.query;
  if (classId) filter.class = classId;
  if (subjectId) filter.subject = subjectId;
  if (teacherId) filter.teacher = teacherId;
  if (status) filter.status = status;

  const skip = (Number(page) - 1) * Number(limit);
  const [homeworks, total] = await Promise.all([
    Homework.find(filter).populate('class', 'name').populate('subject', 'name').populate('teacher', 'name').sort({ dueDate: -1 }).skip(skip).limit(Number(limit)).lean(),
    Homework.countDocuments(filter),
  ]);
  ok(res, { data: homeworks, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
});

export const getHomeworkById = asyncHandler(async (req, res) => {
  const hw = await Homework.findOne({ _id: req.params.id, ...tenantFilter(req), isDeleted: false }).populate('class', 'name').populate('subject', 'name').populate('teacher', 'name').populate('submissions.student', 'name').lean();
  if (!hw) return err(res, 404, 'Homework not found');
  ok(res, { data: hw });
});

export const createHomework = asyncHandler(async (req, res) => {
  const { title, description, classId, subjectId, dueDate, totalMarks, attachments } = req.body;
  if (!title || !classId || !subjectId || !dueDate) return err(res, 400, 'Title, class, subject, and due date are required');
  const hw = await Homework.create({ ...tenantFilter(req), academicYear: req.academicYearId, title, description, class: classId, subject: subjectId, teacher: req.user._id, dueDate, totalMarks, attachments });
  await logAction(req, { action: 'CREATE', module: 'HOMEWORK', targetId: hw._id, newValue: hw });
  ok(res, { data: hw }, 201);
});

export const updateHomework = asyncHandler(async (req, res) => {
  const hw = await Homework.findOneAndUpdate({ _id: req.params.id, ...tenantFilter(req), isDeleted: false }, req.body, { new: true });
  if (!hw) return err(res, 404, 'Homework not found');
  await logAction(req, { action: 'UPDATE', module: 'HOMEWORK', targetId: hw._id, newValue: hw });
  ok(res, { data: hw });
});

export const deleteHomework = asyncHandler(async (req, res) => {
  const hw = await Homework.findOneAndUpdate({ _id: req.params.id, ...tenantFilter(req), isDeleted: false }, { isDeleted: true }, { new: true });
  if (!hw) return err(res, 404, 'Homework not found');
  ok(res, { message: 'Homework deleted' });
});

export const gradeHomework = asyncHandler(async (req, res) => {
  const { studentId, marks, feedback } = req.body;
  const hw = await Homework.findOne({ _id: req.params.id, ...tenantFilter(req), isDeleted: false });
  if (!hw) return err(res, 404, 'Homework not found');
  const sub = hw.submissions.find(s => s.student.toString() === studentId);
  if (sub) { sub.marks = marks; sub.feedback = feedback; sub.status = 'graded'; }
  else { hw.submissions.push({ student: studentId, marks, feedback, status: 'graded', submittedAt: new Date() }); }
  await hw.save();
  ok(res, { data: hw });
});

// ── LESSON PLANS ─────────────────────────────────────────────────────────────

export const getLessonPlans = asyncHandler(async (req, res) => {
  const filter = { ...tenantFilter(req), isDeleted: false };
  const { classId, subjectId, teacherId, status, page = 1, limit = 20 } = req.query;
  if (classId) filter.class = classId;
  if (subjectId) filter.subject = subjectId;
  if (teacherId) filter.teacher = teacherId;
  if (status) filter.status = status;

  const skip = (Number(page) - 1) * Number(limit);
  const [plans, total] = await Promise.all([
    LessonPlan.find(filter).populate('class', 'name').populate('subject', 'name').populate('teacher', 'name').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    LessonPlan.countDocuments(filter),
  ]);
  ok(res, { data: plans, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
});

export const createLessonPlan = asyncHandler(async (req, res) => {
  const { title, description, classId, subjectId, weekNumber, dateFrom, dateTo, objectives, topics, teachingMethods, resources, assessment } = req.body;
  if (!title || !classId || !subjectId) return err(res, 400, 'Title, class, and subject are required');
  const plan = await LessonPlan.create({ ...tenantFilter(req), academicYear: req.academicYearId, title, description, class: classId, subject: subjectId, teacher: req.user._id, weekNumber, dateFrom, dateTo, objectives, topics, teachingMethods, resources, assessment });
  await logAction(req, { action: 'CREATE', module: 'LESSON_PLAN', targetId: plan._id, newValue: plan });
  ok(res, { data: plan }, 201);
});

export const updateLessonPlan = asyncHandler(async (req, res) => {
  const plan = await LessonPlan.findOneAndUpdate({ _id: req.params.id, ...tenantFilter(req), isDeleted: false }, req.body, { new: true });
  if (!plan) return err(res, 404, 'Lesson plan not found');
  ok(res, { data: plan });
});

export const deleteLessonPlan = asyncHandler(async (req, res) => {
  const plan = await LessonPlan.findOneAndUpdate({ _id: req.params.id, ...tenantFilter(req), isDeleted: false }, { isDeleted: true }, { new: true });
  if (!plan) return err(res, 404, 'Lesson plan not found');
  ok(res, { message: 'Lesson plan deleted' });
});

// ── CURRICULUM ───────────────────────────────────────────────────────────────

export const getCurriculums = asyncHandler(async (req, res) => {
  const filter = { ...tenantFilter(req), isDeleted: false };
  const { classId, subjectId, status, page = 1, limit = 20 } = req.query;
  if (classId) filter.class = classId;
  if (subjectId) filter.subject = subjectId;
  if (status) filter.status = status;

  const skip = (Number(page) - 1) * Number(limit);
  const [curricula, total] = await Promise.all([
    Curriculum.find(filter).populate('class', 'name').populate('subject', 'name').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    Curriculum.countDocuments(filter),
  ]);
  ok(res, { data: curricula, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
});

export const createCurriculum = asyncHandler(async (req, res) => {
  const { title, description, classId, subjectId, terms, totalWeeks } = req.body;
  if (!title || !classId || !subjectId) return err(res, 400, 'Title, class, and subject are required');
  const curr = await Curriculum.create({ ...tenantFilter(req), academicYear: req.academicYearId, title, description, class: classId, subject: subjectId, terms, totalWeeks });
  await logAction(req, { action: 'CREATE', module: 'CURRICULUM', targetId: curr._id, newValue: curr });
  ok(res, { data: curr }, 201);
});

export const updateCurriculum = asyncHandler(async (req, res) => {
  const curr = await Curriculum.findOneAndUpdate({ _id: req.params.id, ...tenantFilter(req), isDeleted: false }, req.body, { new: true });
  if (!curr) return err(res, 404, 'Curriculum not found');
  ok(res, { data: curr });
});

export const deleteCurriculum = asyncHandler(async (req, res) => {
  const curr = await Curriculum.findOneAndUpdate({ _id: req.params.id, ...tenantFilter(req), isDeleted: false }, { isDeleted: true }, { new: true });
  if (!curr) return err(res, 404, 'Curriculum not found');
  ok(res, { message: 'Curriculum deleted' });
});
