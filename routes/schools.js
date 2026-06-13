const express    = require('express');
const { body, validationResult } = require('express-validator');
const School     = require('../models/School');
const res_       = require('../middleware/response');

const router = express.Router();

// ── Validation ────────────────────────────────────────────────────────────
const schoolValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('School name is required')
    .isLength({ max: 120 }).withMessage('Name must be under 120 characters'),
];

// ── GET /api/schools ──────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const schools = await School.find({ isActive: true }).sort({ name: 1 });
    return res_.success(res, schools);
  } catch (err) {
    return res_.error(res, err.message);
  }
});

// ── GET /api/schools/:id ──────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const school = await School.findById(req.params.id);
    if (!school || !school.isActive) return res_.notFound(res, 'School not found');
    return res_.success(res, school);
  } catch (err) {
    return res_.error(res, err.message);
  }
});

// ── POST /api/schools ─────────────────────────────────────────────────────
router.post('/', schoolValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res_.badRequest(res, 'Validation failed', errors.array());

  try {
    const { name } = req.body;
    const existing = await School.findOne({ name: name.trim() });
    if (existing) {
      if (!existing.isActive) {
        // Reactivate a previously deleted school
        existing.isActive = true;
        await existing.save();
        return res_.created(res, existing, 'School reactivated');
      }
      return res_.badRequest(res, 'A school with this name already exists');
    }
    const school = await School.create({ name: name.trim() });
    return res_.created(res, school, 'School added');
  } catch (err) {
    return res_.error(res, err.message);
  }
});

// ── PUT /api/schools/:id ──────────────────────────────────────────────────
router.put('/:id', schoolValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res_.badRequest(res, 'Validation failed', errors.array());

  try {
    const school = await School.findByIdAndUpdate(
      req.params.id,
      { name: req.body.name.trim() },
      { new: true, runValidators: true }
    );
    if (!school) return res_.notFound(res, 'School not found');
    return res_.success(res, school, 'School updated');
  } catch (err) {
    if (err.code === 11000) return res_.badRequest(res, 'School name already exists');
    return res_.error(res, err.message);
  }
});

// ── DELETE /api/schools/:id ───────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const school = await School.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!school) return res_.notFound(res, 'School not found');
    return res_.success(res, null, 'School removed');
  } catch (err) {
    return res_.error(res, err.message);
  }
});

module.exports = router;
