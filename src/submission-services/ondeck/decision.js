const DECISION_TIMEOUT_MS = 180_000;
const POLL_MS = 2_000;

async function readPage(page) {
  return page.evaluate(() => {
    const clean = text => (text || '').replace(/\s+/g, ' ').trim();
    const visible = el => el && el.offsetParent !== null;
    const text = document.body.innerText || '';

    const stageMatch = text.match(/(?:^|\n)\s*Stage\s+([^\n]{2,60})/);
    const stage = stageMatch ? clean(stageMatch[1]) : '';

    const heading = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6, strong, b, p, div, span, label')]
      .find(el => visible(el) && /^decline reasons?:?$/i.test(clean(el.innerText)));

    let reasons = [];
    if (heading) {
      let container = heading.parentElement;
      for (let depth = 0; container && depth < 5 && !reasons.length; depth += 1) {
        reasons = [...container.querySelectorAll('li')].filter(visible).map(li => clean(li.innerText)).filter(Boolean);
        container = container.parentElement;
      }
    }
    if (!reasons.length) {
      const after = text.split(/\n\s*Decline Reasons?:?\s*\n/i)[1];
      if (after) {
        reasons = after.split('\n')
          .map(line => clean(line.replace(/^[•\-*]\s*/, '')))
          .filter(Boolean)
          .slice(0, 10);
      }
    }

    const banner = [...document.querySelectorAll('.alert, [role="alert"], .banner, .panel-body, p, div')]
      .filter(visible)
      .map(el => clean(el.innerText))
      .find(line => /unable to approve|declined|approved|congratulations/i.test(line) && line.length < 400) || '';

    const processing = [...document.querySelectorAll('.loadingWithMessage')].some(visible);

    const requiredError = [...document.querySelectorAll('.help-block')]
      .filter(visible)
      .map(el => clean(el.innerText))
      .find(line => /fill out all the required fields/i.test(line)) || '';

    const title = clean(document.querySelector('h1, h2')?.innerText || '');

    return {
      url: window.location.href,
      onForm: window.location.hash.startsWith('#/application') && Boolean(document.querySelector('form[name="newApplication"]')),
      processing,
      requiredError,
      stage,
      reasons: [...new Set(reasons)],
      banner,
      title,
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

  if (state?.stage && state.reasons.length === 0 && /declin/i.test(state.stage)) {
    await page.waitForTimeout(3_000);
    state = await readPage(page).catch(() => state);
  }

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(0);
  console.log(`OnDeck decision after ${seconds}s — stage "${state?.stage || 'unknown'}"${state?.reasons?.length ? `, reasons: ${state.reasons.join(' | ')}` : ''}`);
  return classify(state || { url: page.url(), onForm: true, processing: false, requiredError: '', stage: '', reasons: [], banner: '', title: '' });
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
