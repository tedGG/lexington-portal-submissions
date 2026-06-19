require('dotenv').config();
const express = require('express');
const { randomUUID } = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');
const headway = require('./automators/headway');
const channelPartners = require('./automators/channel-partners');
const fundomate = require('./automators/fundomate');
const iou = require('./automators/iou');
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
    const { businessData, contact1Data, contact2Data, files } = req.body ?? {};
    if (!businessData) {
      return res.status(400).json({ error: 'Missing businessData in request body' });
    }

    const jobId = randomUUID();
    const logs = [];
    jobs.set(jobId, { status: 'pending', logs });

    jobLogStorage.run(logs, () => {
      automator.submitLoan(businessData, contact1Data, contact2Data, files)
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
app.post('/submit-loan/fundomate', requireApiKey, createLoanHandler(fundomate));

app.post('/inspect/iou', requireApiKey, (_req, res) => {
  const jobId = randomUUID();
  const logs = [];
  jobs.set(jobId, { status: 'pending', logs });

  jobLogStorage.run(logs, () => {
    iou.inspect()
      .then(result => jobs.set(jobId, { status: 'done', result, logs }))
      .catch(err => {
        console.error('iou inspect failed:', err);
        jobs.set(jobId, { status: 'error', error: err.message, logs });
      });
  });

  res.status(202).json({ jobId });
});

// Kick off a screenshot job (async — the browser run exceeds Railway's 30s
// request limit, so we can't take it synchronously).
app.post('/inspect/iou/screenshot', requireApiKey, (_req, res) => {
  const jobId = randomUUID();
  const logs = [];
  jobs.set(jobId, { status: 'pending', logs });

  jobLogStorage.run(logs, () => {
    iou.screenshot()
      .then(png => jobs.set(jobId, { status: 'done', png, logs }))
      .catch(err => {
        console.error('iou screenshot failed:', err);
        jobs.set(jobId, { status: 'error', error: err.message, logs });
      });
  });

  res.status(202).json({ jobId });
});

// Serve the captured PNG once the job is done (renders inline in Postman).
app.get('/inspect/iou/screenshot/:id', requireApiKey, (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status === 'error') return res.status(500).json({ error: job.error, logs: job.logs });
  if (job.status !== 'done') return res.status(202).json({ status: job.status, logs: job.logs });
  if (!job.png) return res.status(409).json({
    error: 'This job has no screenshot — it was likely started via POST /inspect/iou (form dump), not POST /inspect/iou/screenshot.',
    logs: job.logs,
  });
  res.set('Content-Type', 'image/png').send(job.png);
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
