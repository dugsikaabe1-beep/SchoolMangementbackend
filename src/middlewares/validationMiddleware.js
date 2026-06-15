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
