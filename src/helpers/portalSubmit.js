const SUBMIT_ENV_VAR = 'ALLOW_PORTAL_SUBMIT';

function isSubmitAllowed() {
  const value = process.env[SUBMIT_ENV_VAR];
  return typeof value === 'string' && value.trim().toLowerCase() === 'true';
}

async function clickSubmit(locator, page, { lender, buttonLabel, confirm }) {
  const button = locator.first();
  await button.waitFor({ timeout: 60_000 });

  if (await button.isDisabled().catch(() => false)) {
    throw new Error(`${lender}: "${buttonLabel}" is disabled — the portal does not consider the application complete`);
  }

  console.log(`>>> ${lender}: clicking "${buttonLabel}" — SUBMITTING THE APPLICATION <<<`);
  await button.click();

  const confirmation = await confirm(page).catch(err => `confirmation check failed: ${err.message}`);
  console.log(`${lender}: submit clicked. ${confirmation || 'No confirmation signal detected.'}`);
  return { submitted: true, confirmation: confirmation || null };
}

async function maybeSubmit(locator, page, options) {
  if (!isSubmitAllowed()) {
    console.log(`${options.lender}: submit step SKIPPED (${SUBMIT_ENV_VAR} is not "true") — "${options.buttonLabel}" was not clicked`);
    return { submitted: false, confirmation: null };
  }
  return clickSubmit(locator, page, options);
}

module.exports = { maybeSubmit, isSubmitAllowed, SUBMIT_ENV_VAR };
