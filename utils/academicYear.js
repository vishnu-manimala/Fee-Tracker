const START_MONTH = parseInt(process.env.ACADEMIC_YEAR_START_MONTH || '6'); // June

// Month names in academic order starting from June
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/**
 * Get academic year label for a given Date.
 */
function getAcademicYear(date = new Date()) {
  const month = date.getMonth() + 1; // 1-indexed
  const year  = date.getFullYear();
  const ayYear = month >= START_MONTH ? year : year - 1;
  return `${ayYear}-${String(ayYear + 1).slice(2)}`;
}

/**
 * Returns all 12 month numbers in academic order for a given year label. [6,7,8,9,10,11,12,1,2,3,4,5]
 */
function getAcademicMonths() {
  const months = [];
  for (let i = 0; i < 12; i++) {
    months.push(((START_MONTH - 1 + i) % 12) + 1);
  }
  return months;
}

/**
 * Parse "2026-27" → { startYear: 2026, endYear: 2027 }
 */
function parseAcademicYear(label) {
  const [start] = label.split('-');
  const startYear = parseInt(start);
  return { startYear, endYear: startYear + 1 };
}

function calendarYearForMonth(academicYearLabel, month) {
  const { startYear, endYear } = parseAcademicYear(academicYearLabel);
  return month >= START_MONTH ? startYear : endYear;
}

function buildEmptyYear(academicYear) {
  return getAcademicMonths().map((month) => ({
    academicYear,
    month,
    amount: null,
    paidOn: null,
    status: 'none',
    note: '',
  }));
}

function monthName(num) {
  return MONTH_NAMES[num - 1];
}


function isOverdue(academicYear, month) {
  const calYear = calendarYearForMonth(academicYear, month);
  const now = new Date();
  // Due from the 2nd of the month onward
  const dueDate = new Date(calYear, month - 1, 2);
  return now >= dueDate;
}

module.exports = {
  getAcademicYear,
  getAcademicMonths,
  parseAcademicYear,
  calendarYearForMonth,
  buildEmptyYear,
  monthName,
  isOverdue,
};
