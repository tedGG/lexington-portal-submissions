const SUBMIT_ENV_VAR = 'ALLOW_PORTAL_SUBMIT';

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

module.exports = { maybeSubmit, isSubmitAllowed, SUBMIT_ENV_VAR };
