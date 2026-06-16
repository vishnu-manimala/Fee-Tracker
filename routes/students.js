const express  = require('express');
const { body, query, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Student  = require('../models/Student');
const School   = require('../models/School');
const res_     = require('../middleware/response');
const { sendDueReminder }    = require('../utils/whatsapp');
const {
  getAcademicYear,
  buildEmptyYear,
  monthName,
  isOverdue,
} = require('../utils/academicYear');

const router = express.Router();

// ── Helpers ───────────────────────────────────────────────────────────────
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// ── Validation rules ──────────────────────────────────────────────────────
const studentValidation = [
  body('fullName').trim().notEmpty().withMessage('Full name is required'),
  body('phone').trim().notEmpty().withMessage('Phone number is required'),
  body('school').notEmpty().withMessage('School is required')
    .custom(v => isValidObjectId(v)).withMessage('Invalid school ID'),
  body('monthlyFee').isNumeric().withMessage('Monthly fee must be a number')
    .custom(v => v >= 0).withMessage('Monthly fee cannot be negative'),
  body('advanceFee').optional().isNumeric().withMessage('Advance fee must be a number'),
  body('place').optional().trim(),
];

// ── GET /api/students ─────────────────────────────────────────────────────
// Query params:
//   ?search=johny          — name/phone search
//   ?status=paid|due|none  — filter by current month status
//   ?school=<id>           — filter by school
//   ?page=1&limit=20       — pagination
router.get('/', async (req, res) => {
  try {
    const { search, status, school, page = 1, limit = 50 } = req.query;
    const filter = { isActive: true };

    // School filter
    if (school && isValidObjectId(school)) filter.school = school;

    // Text search on name
    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    const students = await Student.find(filter)
      .populate('school', 'name')
      .select('fullName phone place school monthlyFee advanceFee isActive lastReminderSentAt payments')
      .sort({ creqatedat: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean({ virtuals: true });

    let results = students;
    if (status) {
      const now          = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentAY    = getAcademicYear();
      results = students.filter((s) => {
        const payment = s.payments?.find(
          (p) => p.academicYear === currentAY && p.month === currentMonth
        );
        const st = payment ? payment.status : 'none';
        return st === status;
      });
    }

    const total = await Student.countDocuments(filter);

    return res_.success(res, {
      students: results,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    return res_.error(res, err.message);
  }
});

// ── POST /api/students ────────────────────────────────────────────────────
// Add new student and initialise the current academic year payment records
router.post('/', studentValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res_.badRequest(res, 'Validation failed', errors.array());

  try {
    const { fullName, phone, school, place, monthlyFee, advanceFee } = req.body;

    // Verify school exists
    const schoolDoc = await School.findById(school);
    if (!schoolDoc || !schoolDoc.isActive) {
      return res_.badRequest(res, 'Selected school does not exist');
    }

    // Initialise current academic year payment records
    const currentAY = getAcademicYear();
    const payments  = buildEmptyYear(currentAY);

    // Auto-mark months that have already passed as 'due'
    for (const p of payments) {
      if (isOverdue(p.academicYear, p.month)) {
        p.status = 'due';
      }
    }

    const student = await Student.create({
      fullName: fullName.trim(),
      phone: phone.trim(),
      school,
      place: place?.trim() || '',
      monthlyFee,
      advanceFee: advanceFee || 0,
      payments,
    });

    await student.populate('school', 'name');
    return res_.created(res, student, 'Student added');
  } catch (err) {
    return res_.error(res, err.message);
  }
});

// ── GET /api/students/:id ─────────────────────────────────────────────────
// Full student info and grouped payment history by academic year
router.get('/:id', async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) return res_.notFound(res, 'Invalid student ID');

    const student = await Student.findById(req.params.id)
      .populate('school', 'name')
      .lean();
    if (!student || !student.isActive) return res_.notFound(res, 'Student not found');

    // Group payments by academic year
    const grouped = {};
    for (const p of student.payments || []) {
      if (!grouped[p.academicYear]) grouped[p.academicYear] = [];
      grouped[p.academicYear].push({
        month: p.month,
        monthName: monthName(p.month),
        paidOn: p.paidOn,
        amount: p.amount,
        status: p.status,
        note: p.note,
        _id: p._id,
      });
    }

    return res_.success(res, {
      ...student,
      paymentsByYear: grouped,
      academicYears: Object.keys(grouped).sort().reverse(),
    });
  } catch (err) {
    return res_.error(res, err.message);
  }
});

// ── PUT /api/students/:id ─────────────────────────────────────────────────
router.put('/:id', studentValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res_.badRequest(res, 'Validation failed', errors.array());

  try {
    if (!isValidObjectId(req.params.id)) return res_.notFound(res, 'Invalid ID');

    const { fullName, phone, school, place, monthlyFee, advanceFee } = req.body;

    const schoolDoc = await School.findById(school);
    if (!schoolDoc || !schoolDoc.isActive) return res_.badRequest(res, 'Invalid school');

    const student = await Student.findByIdAndUpdate(
      req.params.id,
      { fullName: fullName.trim(), phone: phone.trim(), school, place: place?.trim() || '', monthlyFee, advanceFee: advanceFee || 0 },
      { new: true, runValidators: true }
    ).populate('school', 'name');

    if (!student) return res_.notFound(res, 'Student not found');
    return res_.success(res, student, 'Student updated');
  } catch (err) {
    return res_.error(res, err.message);
  }
});

// ── DELETE /api/students/:id ──────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) return res_.notFound(res, 'Invalid ID');
    const student = await Student.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!student) return res_.notFound(res, 'Student not found');
    return res_.success(res, null, 'Student removed');
  } catch (err) {
    return res_.error(res, err.message);
  }
});

// ── POST /api/students/:id/payments/init ──────────────────────────────────
// Add payment records for a new academic year
router.post('/:id/payments/init', async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) return res_.notFound(res, 'Invalid ID');

    const { academicYear } = req.body;
    console.log(academicYear, req.body)
    if (!academicYear || !/^\d{4}-\d{2}$/.test(academicYear)) {
      return res_.badRequest(res, 'academicYear must be in format YYYY-YY e.g. 2026-27');
    }

    const student = await Student.findById(req.params.id);
    if (!student || !student.isActive) return res_.notFound(res, 'Student not found');

    // Check if this year already initialised
    const exists = student.payments.some((p) => p.academicYear === academicYear);
    if (exists) return res_.badRequest(res, `Academic year ${academicYear} already initialised`);

    const newPayments = buildEmptyYear(academicYear);
    student.payments.push(...newPayments);
    await student.save();

    return res_.created(res, newPayments, `Academic year ${academicYear} initialised`);
  } catch (err) {
    return res_.error(res, err.message);
  }
});

// ── PUT /api/students/:id/payments ────────────────────────────────────────
// Mark a specific month's payment status.
router.put('/:id/payments', [
  body('academicYear').notEmpty().withMessage('academicYear required'),
  body('month').isInt({ min: 1, max: 12 }).withMessage('month must be 1–12'),
  body('status').isIn(['paid', 'due', 'none']).withMessage('status must be paid, due, or none'),
  body('paidOn').optional().isISO8601().withMessage('paidOn must be a valid date'),
  body('amount').optional().isNumeric().withMessage('amount must be numeric'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res_.badRequest(res, 'Validation failed', errors.array());

  try {
    if (!isValidObjectId(req.params.id)) return res_.notFound(res, 'Invalid ID');

    const { academicYear, month, status, paidOn, amount, note } = req.body;

    const student = await Student.findById(req.params.id);
    if (!student || !student.isActive) return res_.notFound(res, 'Student not found');

    // Find the matching payment record
    const payment = student.payments.find(
      (p) => p.academicYear === academicYear && p.month === parseInt(month)
    );

    if (!payment) {
      return res_.notFound(res, `No payment record for ${monthName(month)} ${academicYear}. Call /payments/init first.`);
    }

    // Update fields
    payment.status = status;
    if (status === 'paid') {
      payment.paidOn  = paidOn ? new Date(paidOn) : new Date();
      payment.amount  = amount !== undefined ? amount : student.monthlyFee;
    } else {
      // Reverting to due/none clears the paid date
      if (status !== 'due' || !payment.paidOn) {
        payment.paidOn = null;
        payment.amount = null;
      }
    }
    if (note !== undefined) payment.note = note;

    await student.save();

    return res_.success(res, {
      academicYear,
      month: parseInt(month),
      monthName: monthName(month),
      status: payment.status,
      paidOn: payment.paidOn,
      amount: payment.amount,
      note: payment.note,
    }, `Payment updated to "${status}"`);
  } catch (err) {
    return res_.error(res, err.message);
  }
});

// ── GET /api/students/:id/payments/:year ──────────────────────────────────
// Get payment rows for a specific academic year
router.get('/:id/payments/:year', async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) return res_.notFound(res, 'Invalid ID');

    const { year } = req.params;
    const student = await Student.findById(req.params.id).lean();
    if (!student || !student.isActive) return res_.notFound(res, 'Student not found');

    const yearPayments = student.payments
      .filter((p) => p.academicYear === year)
      .map((p) => ({
        month: p.month,
        monthName: monthName(p.month),
        paidOn: p.paidOn,
        amount: p.amount,
        status: p.status,
        note: p.note,
        _id: p._id,
      }));

    if (!yearPayments.length) {
      return res_.notFound(res, `No payment records for academic year ${year}`);
    }

    return res_.success(res, { academicYear: year, payments: yearPayments });
  } catch (err) {
    return res_.error(res, err.message);
  }
});

// ── POST /api/students/:id/remind ─────────────────────────────────────────
// Manually send a WhatsApp due reminder for a specific student.
router.post('/:id/remind', async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) return res_.notFound(res, 'Invalid ID');

    const student = await Student.findById(req.params.id);
    if (!student || !student.isActive) return res_.notFound(res, 'Student not found');

    const currentAY    = getAcademicYear();
    const currentMonth = new Date().getMonth() + 1;

    const payment = student.payments.find(
      (p) => p.academicYear === currentAY && p.month === currentMonth
    );

    if (!payment || payment.status !== 'due') {
      return res_.badRequest(res, 'No due payment found for the current month');
    }

    // const result = await sendDueReminder(
    //   student.phone,
    //   student.fullName,
    //   student.monthlyFee,
    //   monthName(currentMonth),
    //   currentAY
    // );

    if (result.success) {
      student.lastReminderSentAt = new Date();
      await student.save();
      return res_.success(res, { provider: result.provider }, 'WhatsApp reminder sent');
    } else {
      return res_.error(res, `WhatsApp failed: ${result.error}`, 502);
    }
  } catch (err) {
    return res_.error(res, err.message);
  }
});

module.exports = router;
