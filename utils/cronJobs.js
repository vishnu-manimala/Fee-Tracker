/**
 * Cron job: runs every day at 9:00 AM
 */

const cron    = require('node-cron');
const Student = require('../models/Student');
const { sendDueReminder } = require('./whatsapp');
const { getAcademicYear, calendarYearForMonth, monthName, isOverdue } = require('./academicYear');

// ── Auto-mark overdue ─────────────────────────────────────────────────────
// Any payment that is 'none' and its calendar date has passed → mark as 'due'
async function autoMarkOverdue() {
  const students = await Student.find({ isActive: true });
  let markedCount = 0;

  for (const student of students) {
    let changed = false;
    for (const payment of student.payments) {
      if (payment.status === 'none' && isOverdue(payment.academicYear, payment.month)) {
        payment.status = 'due';
        changed = true;
        markedCount++;
      }
    }
    if (changed) await student.save();
  }

  if (markedCount > 0) {
    console.log(`[Cron] Auto-marked ${markedCount} payments as due`);
  }
}

// ── Send due reminders ────────────────────────────────────────────────────
async function sendDueReminders() {
  const currentAY    = getAcademicYear();
  const now          = new Date();
  const currentMonth = now.getMonth() + 1;
  const todayStart   = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Find students who have a 'due' payment for the current month
  const students = await Student.find({
    isActive: true,
    payments: {
      $elemMatch: {
        academicYear: currentAY,
        month: currentMonth,
        status: 'due',
      },
    },
  }).populate('school', 'name');

  console.log(`[Cron] Found ${students.length} students with due fees for ${monthName(currentMonth)} ${currentAY}`);

  let sent = 0, skipped = 0, failed = 0;

  for (const student of students) {
    // Skip if reminder already sent today
    if (
      student.lastReminderSentAt &&
      student.lastReminderSentAt >= todayStart
    ) {
      skipped++;
      continue;
    }

    // const result = await sendDueReminder(
    //   student.phone,
    //   student.fullName,
    //   student.monthlyFee,
    //   monthName(currentMonth),
    //   currentAY
    // );

    if (result.success) {
      student.lastReminderSentAt = now;
      await student.save();
      sent++;
    } else {
      failed++;
    }
  }

  console.log(`[Cron] Reminders — sent: ${sent}, skipped (already sent today): ${skipped}, failed: ${failed}`);
}

// ── Register cron ─────────────────────────────────────────────────────────
function registerCronJobs() {
  const schedule = process.env.DUE_REMINDER_CRON || '0 9 * * *'; // default 9:00 AM daily

  if (!cron.validate(schedule)) {
    console.error(`[Cron] Invalid cron expression: ${schedule}`);
    return;
  }

  cron.schedule(schedule, async () => {
    console.log(`[Cron] Running due reminders job at ${new Date().toISOString()}`);
    try {
      await autoMarkOverdue();
      await sendDueReminders();
    } catch (err) {
      console.error('[Cron] Error in due reminders job:', err.message);
    }
  }, {
    timezone: 'Asia/Kolkata',
  });

  console.log(`Cron job registered: "${schedule}" (Asia/Kolkata)`);
}

module.exports = { registerCronJobs, autoMarkOverdue, sendDueReminders };
