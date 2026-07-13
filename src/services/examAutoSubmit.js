import ExamResult from '../models/ExamResult.js';
import Exam from '../models/Exam.js';
import { sendNotification } from '../utils/notificationService.js';

const AUTO_SUBMIT_INTERVAL_MS = 60_000;

let timer = null;

async function autoSubmitExpiredExams() {
  try {
    const now = new Date();

    const expiredExams = await Exam.find({
      status: { $in: ['Published', 'In_Progress'] },
      endTime: { $lte: now },
      isDeleted: false
    }).select('_id').lean();

    if (!expiredExams.length) return;

    const examIds = expiredExams.map(e => e._id);

    const staleResults = await ExamResult.find({
      exam: { $in: examIds },
      status: 'IN_PROGRESS',
      isDeleted: false
    });

    if (!staleResults.length) return;

    let submitted = 0;
    for (const result of staleResults) {
      try {
        await result.submitExam();

        sendNotification({
          recipientId: result.student,
          schoolId: result.school,
          branchId: result.branch,
          title: 'Exam Auto-Submitted',
          message: `Your exam has been automatically submitted because the time limit was reached. Your score: ${result.score}/${result.maxScore}`,
          type: 'exam',
          priority: 'high',
          actionLink: '/exam-results',
          metadata: { examId: result.exam, resultId: result._id, autoSubmitted: true },
          channels: ['in_app'],
          createdBy: result.student
        }).catch(() => {});

        submitted++;
      } catch (err) {
        console.error(`[ExamAutoSubmit] Failed to auto-submit result ${result._id}:`, err.message);
      }
    }

    if (submitted > 0) {
      console.log(`[ExamAutoSubmit] Auto-submitted ${submitted} expired exam(s)`);
    }
  } catch (err) {
    console.error('[ExamAutoSubmit] Error in auto-submit cycle:', err.message);
  }
}

export function initExamAutoSubmit() {
  console.log('[ExamAutoSubmit] Starting auto-submit checker (every 60s)');
  autoSubmitExpiredExams();
  timer = setInterval(autoSubmitExpiredExams, AUTO_SUBMIT_INTERVAL_MS);
}

export function stopExamAutoSubmit() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
