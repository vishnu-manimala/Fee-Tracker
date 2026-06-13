const response = {
  success: (res, data, message = 'Success', statusCode = 200) => {
    return res.status(statusCode).json({ success: true, message, data });
  },
  created: (res, data, message = 'Created') => {
    return res.status(201).json({ success: true, message, data });
  },
  error: (res, message = 'Something went wrong', statusCode = 500, errors = null) => {
    const payload = { success: false, message };
    if (errors) payload.errors = errors;
    return res.status(statusCode).json(payload);
  },
  notFound: (res, message = 'Not found') => {
    return res.status(404).json({ success: false, message });
  },
  badRequest: (res, message = 'Bad request', errors = null) => {
    const payload = { success: false, message };
    if (errors) payload.errors = errors;
    return res.status(400).json(payload);
  },
};

module.exports = response;
