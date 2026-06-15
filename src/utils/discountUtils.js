import DiscountAssignment from '../models/DiscountAssignment.js';

const addMonths = (date, months) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
};

export const resolveDiscountEndDate = (duration, startDate, customEndDate) => {
  const start = startDate ? new Date(startDate) : new Date();

  if (duration === 'one_month') return addMonths(start, 1);
  if (duration === 'semester') return addMonths(start, 6);
  if (duration === 'academic_year') return addMonths(start, 12);
  if (duration === 'custom') return customEndDate ? new Date(customEndDate) : null;
  return null;
};

export const getActiveDiscountAssignmentsForStudent = async (student, asOfDate = new Date()) => {
  if (!student?._id) return [];

  const studentClass = student.class?._id || student.class;
  const grade = student.class?.name || student.grade;
  const asOf = new Date(asOfDate);

  return DiscountAssignment.find({
    school: student.school?._id || student.school,
    isActive: true,
    startDate: { $lte: asOf },
    $and: [
      {
        $or: [
          { endDate: null },
          { endDate: { $exists: false } },
          { endDate: { $gte: asOf } },
        ],
      },
      {
        $or: [
          { scope: { $in: ['student', 'students'] }, students: student._id },
          ...(studentClass ? [{ scope: 'class', class: studentClass }] : []),
          ...(grade ? [{ scope: 'grade', grade }] : []),
        ],
      },
    ],
  }).populate('discount');
};

export const calculateDiscountedAmount = (baseAmount, assignments = []) => {
  const originalAmount = Math.max(0, Number(baseAmount || 0));
  let totalDiscount = 0;
  const appliedDiscounts = [];

  assignments.forEach((assignment) => {
    const discount = assignment.discount || assignment.discountSnapshot;
    if (!discount || discount.isActive === false) return;

    const value = Number(discount.value || 0);
    if (value <= 0) return;

    const discountAmount = discount.valueType === 'percentage'
      ? (originalAmount * Math.min(value, 100)) / 100
      : value;

    const safeAmount = Math.min(Math.max(0, discountAmount), Math.max(0, originalAmount - totalDiscount));
    if (safeAmount <= 0) return;

    totalDiscount += safeAmount;
    appliedDiscounts.push({
      assignment: assignment._id,
      discount: discount._id || assignment.discount,
      name: discount.name,
      type: discount.type,
      valueType: discount.valueType,
      value,
      amount: safeAmount,
      startDate: assignment.startDate,
      endDate: assignment.endDate,
    });
  });

  return {
    originalAmount,
    discountAmount: totalDiscount,
    finalAmount: Math.max(0, originalAmount - totalDiscount),
    appliedDiscounts,
  };
};

export const calculateStudentMonthlyFee = async (student, baseAmount, asOfDate = new Date()) => {
  const assignments = await getActiveDiscountAssignmentsForStudent(student, asOfDate);
  return calculateDiscountedAmount(baseAmount, assignments);
};
