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

async function waitForDecision(page) {
  const startedAt = Date.now();
  let state = null;

  while (Date.now() - startedAt < DECISION_TIMEOUT_MS) {
    await page.waitForTimeout(POLL_MS);
    state = await readPage(page).catch(() => state);
    if (!state) continue;

    if (state.stage) break;
    if (!state.processing && state.requiredError && Date.now() - startedAt > 10_000) break;
  }

  for (let waited = 0; state?.stage && /declin/i.test(state.stage) && !state.reasons.length && waited < 15_000; waited += POLL_MS) {
    await page.waitForTimeout(POLL_MS);
    state = await readPage(page).catch(() => state);
  }

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(0);
  console.log(`OnDeck decision after ${seconds}s — application #${state?.applicationNumber || '?'}, stage "${state?.stage || 'unknown'}"${state?.reasons?.length ? `, reasons: ${state.reasons.join(' | ')}` : ''}`);
  return classify(state || { url: page.url(), onForm: true, processing: false, requiredError: '', stage: '', applicationNumber: '', reasons: [], banner: '', businessName: '' });
}

function confirmOnDeckSubmit(holder) {
  return async page => {
    console.log('OnDeck: waiting for the portal to process the application (can take ~60s)...');
    const decision = await waitForDecision(page);
    holder.decision = decision;

    if (decision.stage) {
      return { verified: true, detail: `deal stage "${decision.stage}" at ${decision.url}` };
    }
    if (decision.requiredError) {
      return { verified: false, detail: `portal refused: ${decision.requiredError}` };
    }
    if (!decision.onForm) {
      return { verified: true, detail: `left the application form (${decision.url}) but no stage was readable` };
    }
    return { verified: false, detail: `no deal page after ${DECISION_TIMEOUT_MS / 1000}s — still on ${decision.url}` };
  };
}

module.exports = { confirmOnDeckSubmit, waitForDecision };
