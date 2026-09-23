require('dotenv').config();
const express = require('express');
const { randomUUID } = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');
const channelPartners = require('./submission-services/channel-partners');
const iou = require('./submission-services/iou');
const ibusiness = require('./submission-services/ibusiness');
const kudoFunding = require('./submission-services/kudo-funding');
const { submitTestForm } = require('./test-automator');
const { reportSubmission } = require('./helpers/submissionStatus');

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

function createLoanHandler(automator, lender) {
  return (req, res) => {
    const { businessData, contact1Data, contact2Data, files, submissionId } = req.body ?? {};
    if (!businessData) {
      return res.status(400).json({ error: 'Missing businessData in request body' });
    }

    const recordId = submissionId ?? businessData.salesforceRecordId ?? null;
    businessData.salesforceRecordId ??= recordId;
    const jobId = randomUUID();
    const logs = [];
    const startedAt = new Date();
    jobs.set(jobId, { status: 'pending', logs });

    jobLogStorage.run(logs, async () => {
      let job;
      try {
        const result = await automator.submitLoan(businessData, contact1Data, contact2Data, files);
        job = { status: 'done', result, logs };
        job.salesforce = await reportSubmission(recordId, { lender, result, logs, startedAt });
      } catch (err) {
        console.error('Loan submission failed:', err);
        job = { status: 'error', error: err.message, logs };
        job.salesforce = await reportSubmission(recordId, { lender, error: err, logs, startedAt });
      }
      jobs.set(jobId, job);
    });

    res.status(202).json({ jobId });
  };
}

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/submit-loan/channel-partners', requireApiKey, createLoanHandler(channelPartners, 'Channel Partners'));
app.post('/submit-loan/iou', requireApiKey, createLoanHandler(iou, 'IOU Financial'));
app.post('/submit-loan/ibusiness', requireApiKey, createLoanHandler(ibusiness, 'IBusiness'));
app.post('/submit-loan/kudo-funding', requireApiKey, createLoanHandler(kudoFunding, 'Kudo Funding'));

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

app.get('/inspect/iou/screenshot', requireApiKey, async (req, res) => {
  try {
    const png = await iou.screenshot({
      preSubmit: req.query.preSubmit === 'true',
      newApplication: req.query.newApplication === 'true',
      fillTestData: req.query.fillTestData === 'true',
    });
    res.set('Content-Type', 'image/png').send(png);
  } catch (err) {
    console.error('iou screenshot failed:', err);
    res.status(500).json({ error: 'Screenshot failed', details: err.message });
  }
});

app.post('/inspect/iou/screenshot-sf', requireApiKey, (req, res) => {
  const recordId = req.query.recordId;
  const preSubmit = req.query.preSubmit === 'true';
  const newApplication = req.query.newApplication === 'true';
  const fillTestData = req.query.fillTestData === 'true';
  const jobId = randomUUID();
  const logs = [];
  jobs.set(jobId, { status: 'pending', logs });

  jobLogStorage.run(logs, () => {
    iou.screenshotToSalesforce(recordId, { preSubmit, newApplication, fillTestData })
      .then(result => jobs.set(jobId, { status: 'done', result, logs }))
      .catch(err => {
        console.error('iou screenshot-sf failed:', err);
        jobs.set(jobId, { status: 'error', error: err.message, logs });
      });
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
