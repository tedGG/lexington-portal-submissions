const SUBMIT_ENV_VAR = 'ALLOW_PORTAL_SUBMIT';

async function waitForNetworkQuiet(page, { quietMs = 4_000, timeoutMs = 180_000, label = 'network' } = {}) {
  let inFlight = 0;
  let lastActivity = Date.now();
  let peak = 0;

  const onRequest = () => { inFlight += 1; peak = Math.max(peak, inFlight); lastActivity = Date.now(); };
  const onSettled = () => { inFlight = Math.max(0, inFlight - 1); lastActivity = Date.now(); };

  page.on('request', onRequest);
  page.on('requestfinished', onSettled);
  page.on('requestfailed', onSettled);

  const startedAt = Date.now();
  try {
    while (Date.now() - startedAt < timeoutMs) {
      await page.waitForTimeout(500);
      if (inFlight === 0 && Date.now() - lastActivity >= quietMs) {
        const waited = ((Date.now() - startedAt) / 1000).toFixed(1);
        console.log(`${label}: settled after ${waited}s (${peak} request(s) seen)`);
        return true;
      }
    }
    console.log(`${label}: still busy after ${(timeoutMs / 1000).toFixed(0)}s with ${inFlight} request(s) in flight — continuing anyway`);
    return false;
  } finally {
    page.off('request', onRequest);
    page.off('requestfinished', onSettled);
    page.off('requestfailed', onSettled);
  }
}

function isSubmitAllowed() {
  const value = process.env[SUBMIT_ENV_VAR];
  return typeof value === 'string' && value.trim().toLowerCase() === 'true';
}

async function clickSubmit(locator, page, { lender, buttonLabel, confirm, confirmDialog }) {
  const button = locator.first();
  await button.waitFor({ timeout: 60_000 });

  if (await button.isDisabled().catch(() => false)) {
    throw new Error(`${lender}: "${buttonLabel}" is disabled — the portal does not consider the application complete`);
  }

  console.log(`>>> ${lender}: clicking "${buttonLabel}" — SUBMITTING THE APPLICATION <<<`);
  await button.scrollIntoViewIfNeeded().catch(() => {});
  await button.click();

  if (typeof confirmDialog === 'function') {
    await confirmDialog(page).catch(err => console.log(`${lender}: confirmation dialog step failed: ${err.message}`));
  }

  const outcome = await confirm(page).catch(err => ({ verified: false, detail: `confirmation check failed: ${err.message}` }));
  const verified = outcome?.verified === true;
  const detail = outcome?.detail || 'no confirmation signal detected';

  console.log(verified
    ? `${lender}: submit confirmed — ${detail}`
    : `${lender}: submit clicked but NOT CONFIRMED — ${detail}. Verify in the portal whether it went through.`);

  return { submitted: true, submitVerified: verified, confirmation: detail };
}

async function maybeSubmit(locator, page, options) {
  if (options.sandbox) {
    console.log(`${options.lender}: submit step SKIPPED — sandbox payload, applications are never submitted from sandbox`);
    return { submitted: false, submitVerified: false, confirmation: 'skipped: sandbox' };
  }
  if (!isSubmitAllowed()) {
    console.log(`${options.lender}: submit step SKIPPED (${SUBMIT_ENV_VAR} is not "true") — "${options.buttonLabel}" was not clicked`);
    return { submitted: false, submitVerified: false, confirmation: null };
  }
  return clickSubmit(locator, page, options);
}

module.exports = { maybeSubmit, isSubmitAllowed, waitForNetworkQuiet, SUBMIT_ENV_VAR };
