require('dotenv').config();
const express = require('express');
const { randomUUID } = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');
const headway = require('./automators/headway');
const channelPartners = require('./automators/channel-partners');
const { submitTestForm } = require('./test-automator');

const app = express();
const PORT = process.env.PORT || 3000;
const API_SECRET_KEY = process.env.API_SECRET_KEY;

app.use(express.json());

const jobs = new Map();
const jobLogStorage = new AsyncLocalStorage();

const originalLog = console.log;
console.log = (...args) => {
  const store = jobLogStorage.getStore();
  if (store) store.push(args.map(String).join(' '));
  originalLog(...args);
};

function requireApiKey(req, res, next) {
  if (req.headers['x-api-key'] !== API_SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function createLoanHandler(automator) {
  return (req, res) => {
    const { businessData, contact1Data, contact2Data } = req.body ?? {};
    if (!businessData) {
      return res.status(400).json({ error: 'Missing businessData in request body' });
    }

    const jobId = randomUUID();
    const logs = [];
    jobs.set(jobId, { status: 'pending', logs });

    jobLogStorage.run(logs, () => {
      automator.submitLoan(businessData, contact1Data, contact2Data)
        .then(result => jobs.set(jobId, { status: 'done', result, logs }))
        .catch(err => {
          console.error('Loan submission failed:', err);
          jobs.set(jobId, { status: 'error', error: err.message, logs });
        });
    });

    res.status(202).json({ jobId });
  };
}

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/submit-loan/headway', requireApiKey, createLoanHandler(headway));
app.post('/submit-loan/channel-partners', requireApiKey, createLoanHandler(channelPartners));

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
