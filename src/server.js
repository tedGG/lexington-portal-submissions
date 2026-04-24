require('dotenv').config();
const express = require('express');
const { submitLoan } = require('./automator');

const app = express();
const PORT = process.env.PORT || 3000;
const API_SECRET_KEY = process.env.API_SECRET_KEY;

app.use(express.json());

function requireApiKey(req, res, next) {
  if (req.headers['x-api-key'] !== API_SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/submit-loan', requireApiKey, async (req, res) => {
  const { loanData } = req.body ?? {};
  if (!loanData) {
    return res.status(400).json({ error: 'Missing loanData in request body' });
  }

  const required = ['applicantName', 'email', 'loanAmount', 'loanTerm'];
  const missing = required.filter(f => loanData[f] == null);
  if (missing.length) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  try {
    const result = await submitLoan(loanData);
    res.json(result);
  } catch (err) {
    console.error('Loan submission failed:', err);
    res.status(500).json({ error: 'Loan submission failed', details: err.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
