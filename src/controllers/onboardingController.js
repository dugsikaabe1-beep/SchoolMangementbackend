import School from '../models/School.js';
import AcademicYear from '../models/AcademicYear.js';
import Branch from '../models/Branch.js';
import Class from '../models/Class.js';
import User from '../models/User.js';

/**
 * @desc    Get onboarding status for a school
 * @route   GET /api/v1/onboarding/status
 * @access  Private (School Admin)
 */
export const getOnboardingStatus = async (req, res) => {
  try {
    const school = await School.findById(req.schoolId).select('onboarding name');
    res.json({ success: true, onboarding: school.onboarding });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Complete an onboarding step
 * @route   POST /api/v1/onboarding/step/:stepName
 * @access  Private (School Admin)
 */
export const completeOnboardingStep = async (req, res) => {
  const { stepName } = req.params;
  const schoolId = req.schoolId;

  try {
    const school = await School.findById(schoolId);
    if (!school) return res.status(404).json({ success: false, message: 'School not found' });

    // Validate step exists
    if (school.onboarding.steps[stepName] === undefined) {
      return res.status(400).json({ success: false, message: 'Invalid onboarding step' });
    }

    // Perform specific step validation if needed
    let isValid = true;
    switch (stepName) {
      case 'academicYear':
        const yearCount = await AcademicYear.countDocuments({ school: schoolId });
        if (yearCount === 0) isValid = false;
        break;
      case 'branches':
        const branchCount = await Branch.countDocuments({ tenant: schoolId });
        if (branchCount === 0) isValid = false;
        break;
      case 'classes':
        const classCount = await Class.countDocuments({ school: schoolId });
        if (classCount === 0) isValid = false;
        break;
    }

    if (!isValid) {
      return res.status(400).json({ 
        success: false, 
        message: `Please complete the ${stepName} setup before proceeding.` 
      });
    }

    // Mark step as completed
    school.onboarding.steps[stepName] = true;
    
    // Determine next step or completion
    const steps = ['schoolInfo', 'academicYear', 'branches', 'classes', 'teachers', 'students'];
    const currentIdx = steps.indexOf(stepName);
    
    if (currentIdx < steps.length - 1) {
      school.onboarding.currentStep = currentIdx + 2;
    } else {
      school.onboarding.isCompleted = true;
    }

    await school.save();
    res.json({ success: true, onboarding: school.onboarding });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
