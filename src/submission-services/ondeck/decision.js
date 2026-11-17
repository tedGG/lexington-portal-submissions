const DECISION_TIMEOUT_MS = 180_000;
const POLL_MS = 2_000;

async function readPage(page) {
  return page.evaluate(() => {
    const clean = text => (text || '').replace(/\s+/g, ' ').trim();
    const visible = el => Boolean(el) && el.offsetParent !== null;
    const labelled = (prefix) => {
      const span = [...document.querySelectorAll('span')]
        .find(el => visible(el) && el.querySelector('strong') && clean(el.innerText).startsWith(prefix));
      return span ? clean(span.querySelector('strong').innerText) : '';
    };

    const heading = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')]
      .find(el => visible(el) && /^decline reasons?:?$/i.test(clean(el.innerText)));
    const reasonsPanel = heading ? heading.closest('.panel-body') || heading.parentElement : null;
    const reasons = reasonsPanel
      ? [...reasonsPanel.querySelectorAll('li')].filter(visible).map(li => clean(li.innerText)).filter(Boolean)
      : [];

    const banner = [...document.querySelectorAll('.alert')]
      .filter(visible)
      .map(el => clean(el.innerText))
      .filter(Boolean)
      .join(' ');

    const requiredError = [...document.querySelectorAll('.help-block')]
      .filter(visible)
      .map(el => clean(el.innerText))
      .find(line => /fill out all the required fields/i.test(line)) || '';

    const statusHeading = document.querySelector('#application h4.text-info');

    return {
      url: window.location.href,
      onForm: Boolean(document.querySelector('form[name="newApplication"]')),
      processing: [...document.querySelectorAll('.loadingWithMessage')].some(visible),
      requiredError,
      stage: labelled('Stage'),
      applicationNumber: labelled('Application #'),
      reasons: [...new Set(reasons)],
      banner,
      businessName: visible(statusHeading) ? clean(statusHeading.innerText) : '',
    };
  });
}

function classify(state) {
  const declined = /declin/i.test(state.stage) || /unable to approve/i.test(state.banner);
  return { ...state, declined };
}

const NO_EFFECT_MS = 30_000;

function isOnDeckUrl(url) {
  try {
    const { hostname } = new URL(url);
    return hostname === 'ondeck.com' || hostname.endsWith('.ondeck.com');
  } catch {
    return false;
  }
}

function watchActivity(page) {
  const writes = [];
  const failures = [];
  const errors = [];

  const onRequest = request => {
    if (request.method() !== 'GET' && isOnDeckUrl(request.url())) {
      writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
  };
  const onResponse = response => {
    if (response.status() >= 400 && isOnDeckUrl(response.url())) {
      failures.push(`HTTP ${response.status()} ${response.request().method()} ${new URL(response.url()).pathname}`);
    }
  };
  const onFailed = request => {
    if (isOnDeckUrl(request.url())) failures.push(`${request.method()} ${new URL(request.url()).pathname} — ${request.failure()?.errorText || 'failed'}`);
  };
  const onConsole = message => {
    if (message.type() === 'error') errors.push(`console: ${message.text().slice(0, 200)}`);
  };
  const onPageError = error => errors.push(`page error: ${error.message.slice(0, 200)}`);

  page.on('request', onRequest);
  page.on('response', onResponse);
  page.on('requestfailed', onFailed);
  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  return {
    writes,
    failures,
    errors,
    summary: () => [
      `requests sent: ${writes.length ? [...new Set(writes)].join(', ') : 'none'}`,
      failures.length ? `failed: ${[...new Set(failures)].join(', ')}` : null,
      errors.length ? `errors: ${[...new Set(errors)].slice(0, 5).join(' | ')}` : null,
    ].filter(Boolean).join('; '),
    stop: () => {
      page.off('request', onRequest);
      page.off('response', onResponse);
      page.off('requestfailed', onFailed);
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
    },
  };
}

async function waitForDecision(page, activity) {
  const startedAt = Date.now();
  let state = null;
  let sawProcessing = false;
  let noEffect = false;

  while (Date.now() - startedAt < DECISION_TIMEOUT_MS) {
    await page.waitForTimeout(POLL_MS);
    state = await readPage(page).catch(() => state);
    if (!state) continue;
    if (state.processing) sawProcessing = true;

    if (state.stage) break;
    if (!state.processing && state.requiredError && Date.now() - startedAt > 10_000) break;
    if (!sawProcessing && state.onForm && !activity?.writes.length && Date.now() - startedAt > NO_EFFECT_MS) {
      noEffect = true;
      break;
    }
  }

  for (let waited = 0; state?.stage && /declin/i.test(state.stage) && !state.reasons.length && waited < 15_000; waited += POLL_MS) {
    await page.waitForTimeout(POLL_MS);
    state = await readPage(page).catch(() => state);
  }

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(0);
  console.log(`OnDeck decision after ${seconds}s — application #${state?.applicationNumber || '?'}, stage "${state?.stage || 'unknown'}"${state?.reasons?.length ? `, reasons: ${state.reasons.join(' | ')}` : ''}`);
  const empty = { url: page.url(), onForm: true, processing: false, requiredError: '', stage: '', applicationNumber: '', reasons: [], banner: '', businessName: '' };
  return { ...classify(state || empty), sawProcessing, noEffect, seconds: Number(seconds) };
}

function confirmOnDeckSubmit(holder, activity) {
  return async page => {
    console.log('OnDeck: waiting for the portal to process the application (can take ~60s)...');
    const decision = await waitForDecision(page, activity);
    holder.decision = decision;
    const seen = activity ? ` — ${activity.summary()}` : '';
    if (activity) console.log(`OnDeck activity after Continue${seen}`);

    if (decision.stage) {
      return { verified: true, detail: `deal stage "${decision.stage}" at ${decision.url}` };
    }
    if (decision.requiredError) {
      return { verified: false, detail: `portal refused: ${decision.requiredError}${seen}` };
    }
    if (!decision.onForm) {
      return { verified: true, detail: `left the application form (${decision.url}) but no stage was readable${seen}` };
    }
    if (decision.noEffect) {
      return { verified: false, detail: `Continue had no effect — no processing screen and no request to OnDeck within ${NO_EFFECT_MS / 1000}s${decision.banner ? `, portal message: ${decision.banner}` : ''}${seen}` };
    }
    return { verified: false, detail: `no deal page after ${decision.seconds}s — still on ${decision.url}${decision.banner ? `, portal message: ${decision.banner}` : ''}${seen}` };
  };
}

module.exports = { confirmOnDeckSubmit, waitForDecision, watchActivity };
