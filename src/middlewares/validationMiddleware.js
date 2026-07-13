import { z } from 'zod';

const formatZodIssues = (error) => {
  const issues = error?.issues || error?.errors || [];
  return issues.map((err) => ({
    field: (err.path || []).join('.'),
    message: err.message,
  }));
};

/**
 * Validation Middleware
 * @param {z.ZodSchema} schema - The Zod schema to validate against
 */
export const validate = (schema) => (req, res, next) => {
  try {
    schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    next();
  } catch (error) {
    const issues = formatZodIssues(error);
    const first = issues[0]?.message || 'Invalid data provided';
    return res.status(400).json({
      success: false,
      message: 'Validation Error',
      userMessage: first,
      errors: issues,
    });
  }
};

// --- SCHEMAS ---

export const adminLoginBodySchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(6, 'Password must be at least 6 characters').max(200),
  }),
});

export const credLoginSchema = z.object({
  body: z.object({
    customId: z.string().min(1, 'ID is required').max(64).optional(),
    phone: z.string().min(1, 'Phone is required').max(32).optional(),
    email: z.string().email('Invalid email').max(120).optional(),
    password: z.string().min(1, 'Password is required').max(200),
    tenantId: z.string().max(64).optional(),
    branchId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Branch ID').optional(),
  }).refine((body) => Boolean(body.customId || body.phone || body.email), {
    message: 'ID, phone, or email is required',
    path: ['customId'],
  }),
});

/** Scoped school login: email or student/teacher ID + password */
export const schoolScopedLoginSchema = z.object({
  body: z
    .object({
      email: z.string().email().optional(),
      customId: z.string().min(1).max(64).optional(),
      password: z.string().min(6).max(200),
    })
    .refine((b) => Boolean(b.email || b.customId), {
      message: 'Email or school ID is required',
      path: ['email'],
    }),
});

export const createUserSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Name is too short'),
    email: z.string().email('Invalid email format'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    role: z.enum(['school_admin', 'teacher', 'student', 'parent', 'accountant']),
  }),
});

export const studentSchema = z.object({
  body: z.object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: z.string().email().optional(),
    classId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Class ID'),
  }),
});

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID format');
const dateValue = z.string().trim().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: 'Invalid date',
});

const academicTermFields = {
  name: z.string().trim().min(2, 'Term name must be at least 2 characters').max(80, 'Term name is too long'),
  code: z.string().trim().max(20, 'Term code is too long').optional().or(z.literal('')),
  academicYear: objectId,
  startDate: dateValue,
  endDate: dateValue,
  order: z.coerce.number().int('Order must be a whole number').min(1, 'Order must be at least 1').max(12, 'Order cannot exceed 12'),
  status: z.enum(['active', 'upcoming', 'completed', 'archived']).optional(),
  isCurrent: z.boolean().optional(),
  description: z.string().trim().max(500, 'Description is too long').optional().or(z.literal('')),
};

export const academicTermQuerySchema = z.object({
  query: z.object({
    academicYearId: objectId.optional(),
  }),
});

export const academicTermParamSchema = z.object({
  params: z.object({
    id: objectId,
  }),
});

export const createAcademicTermSchema = z.object({
  body: z.object(academicTermFields).refine((body) => new Date(body.endDate) >= new Date(body.startDate), {
    message: 'End date must be on or after start date',
    path: ['endDate'],
  }),
});

export const updateAcademicTermSchema = z.object({
  params: z.object({
    id: objectId,
  }),
  body: z.object(academicTermFields).partial().refine((body) => {
    if (!body.startDate || !body.endDate) return true;
    return new Date(body.endDate) >= new Date(body.startDate);
  }, {
    message: 'End date must be on or after start date',
    path: ['endDate'],
  }),
});

const streamFields = {
  name: z.string().trim().min(2, 'Stream name must be at least 2 characters').max(80, 'Stream name is too long'),
  code: z.string().trim().max(20, 'Stream code is too long').optional().or(z.literal('')),
  branch: objectId.optional().or(z.literal('')),
  description: z.string().trim().max(500, 'Description is too long').optional().or(z.literal('')),
};

export const streamParamSchema = z.object({
  params: z.object({
    id: objectId,
  }),
});

export const createStreamSchema = z.object({
  body: z.object(streamFields),
});

export const updateStreamSchema = z.object({
  params: z.object({
    id: objectId,
  }),
  body: z.object(streamFields).partial(),
});
