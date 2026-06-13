const express  = require('express');
const Student  = require('../models/Student');
const res_     = require('../middleware/response');
const { getAcademicYear } = require('../utils/academicYear');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const currentAY    = getAcademicYear();
    const currentMonth = new Date().getMonth() + 1;

    const students = await Student.find({ isActive: true })
      .select('payments monthlyFee')
      .lean();

    let paid = 0, due = 0, none = 0, totalExpected = 0;

    for (const student of students) {
      totalExpected += student.monthlyFee;
      const payment = student.payments?.find(
        (p) => p.academicYear === currentAY && p.month === currentMonth
      );
      const status = payment?.status || 'none';
      if (status === 'paid') paid++;
      else if (status === 'due') due++;
      else none++;
    }

    const totalCollected = await Student.aggregate([
      { $match: { isActive: true } },
      { $unwind: '$payments' },
      { $match: { 'payments.academicYear': currentAY, 'payments.month': currentMonth, 'payments.status': 'paid' } },
      { $group: { _id: null, total: { $sum: '$payments.amount' } } },
    ]);

    return res_.success(res, {
      academicYear: currentAY,
      month: currentMonth,
      total: students.length,
      paid,
      due,
      pending: none,
      totalExpectedThisMonth: totalExpected,
      totalCollectedThisMonth: totalCollected[0]?.total || 0,
    });
  } catch (err) {
    return res_.error(res, err.message);
  }
});

module.exports = router;
