require('dotenv').config();
const express = require('express');
const { randomUUID } = require('crypto');
const { submitLoan } = require('./automator');
const { submitTestForm } = require('./test-automator');

const app = express();
const PORT = process.env.PORT || 3000;
const API_SECRET_KEY = process.env.API_SECRET_KEY;

app.use(express.json());

const jobs = new Map();

function requireApiKey(req, res, next) {
  if (req.headers['x-api-key'] !== API_SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/submit-loan', requireApiKey, (req, res) => {
  const { loanData } = req.body ?? {};
  if (!loanData) {
    return res.status(400).json({ error: 'Missing loanData in request body' });
  }

  const required = ['applicantName', 'email', 'loanAmount', 'loanTerm'];
  const missing = required.filter(f => loanData[f] == null);
  if (missing.length) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  const jobId = randomUUID();
  jobs.set(jobId, { status: 'pending' });

  submitLoan(loanData)
    .then(result => jobs.set(jobId, { status: 'done', result }))
    .catch(err => {
      console.error('Loan submission failed:', err);
      jobs.set(jobId, { status: 'error', error: err.message });
    });

  res.status(202).json({ jobId });
});

app.get('/job/:id', requireApiKey, (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

app.post('/test-submit', requireApiKey, async (req, res) => {
  const data = req.body ?? {};
  const required = ['firstName', 'lastName', 'email', 'phone', 'address'];
  const missing = required.filter(f => data[f] == null);
  if (missing.length) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  try {
    const result = await submitTestForm(data);
    res.json(result);
  } catch (err) {
    console.error('Test submission failed:', err);
    res.status(500).json({ error: 'Test submission failed', details: err.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
