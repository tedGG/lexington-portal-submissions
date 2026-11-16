const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const { uploadScreenshot } = require('../../helpers/salesforce');
const { installWriteGuard } = require('./guard');
const { fillApplicationForm, TEST_DATA, TEST_CONTACT, TEST_CONTACT_2 } = require('./forms');
const { confirmOnDeckSubmit } = require('./decision');
const { createDeclinedOffer } = require('./offer');
const { maybeSubmit, isSubmitAllowed, SUBMIT_ENV_VAR } = require('../../helpers/portalSubmit');

const { ONDECK_URL, ONDECK_USERNAME, ONDECK_PASSWORD } = process.env;

const LOGIN_FORM = 'form[name="loginForm"]';
const EMAIL_INPUT = `${LOGIN_FORM} #email`;
const PASSWORD_INPUT = `${LOGIN_FORM} #password`;
const SIGN_IN_BUTTON = `${LOGIN_FORM} button[type="submit"]`;
const LOGIN_ERROR = '.alert.alert-danger:visible';
const NEW_APP_LINK = 'a.hdr2__subMenuItemLink[href="#/application/"]:visible';
const FORM_HEADING = 'Business Information';
const FIRST_FIELD_LABEL = 'Exact Legal Company Name';
const CONTINUE_BUTTON = 'form[name="newApplication"] button[type="submit"]';
const ONDECK_SUBMIT_ENV_VAR = 'ONDECK_ALLOW_SUBMIT';

function assertConfigured() {
  if (!ONDECK_URL) throw new Error('ONDECK_URL is not set');
  if (!ONDECK_USERNAME || !ONDECK_PASSWORD) throw new Error('ONDECK_USERNAME / ONDECK_PASSWORD are not set');
}

function isSandbox(businessData) {
  return businessData?.sandbox === true || String(businessData?.sandbox).toLowerCase() === 'true';
}

async function launch() {
  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== 'false',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  return { browser, context };
}

async function login(page) {
  try {
    await page.goto(ONDECK_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  } catch (err) {
    throw new Error(`OnDeck portal did not load (${err.message.split('\n')[0]}) — the portal only accepts US IP addresses`);
  }

  await page.locator(EMAIL_INPUT).waitFor({ timeout: 45_000 });
  console.log(`Login page loaded. URL: ${page.url()}`);

  await page.fill(EMAIL_INPUT, ONDECK_USERNAME);
  await page.fill(PASSWORD_INPUT, ONDECK_PASSWORD);
  await page.click(SIGN_IN_BUTTON);

  const newApp = page.locator(NEW_APP_LINK).first();
  const error = page.locator(LOGIN_ERROR).first();

  await Promise.race([
    newApp.waitFor({ timeout: 45_000 }),
    error.waitFor({ timeout: 45_000 }),
  ]).catch(() => {});

  if (!(await newApp.isVisible().catch(() => false))) {
    const message = await error.innerText({ timeout: 2_000 }).catch(() => '');
    const detail = message.replace(/\s+/g, ' ').trim();
    throw new Error(`OnDeck login failed${detail ? `: ${detail}` : ' (no "New App" menu after sign in)'} (on ${page.url()})`);
  }

  console.log(`Logged in. URL: ${page.url()}`);
}

async function summariseForm(page) {
  return page.evaluate(() => {
    const visible = el => el.offsetParent !== null;
    const controls = [...document.querySelectorAll('input, select, textarea')]
      .filter(el => el.type !== 'hidden' && visible(el));
    const labels = [...document.querySelectorAll('label')]
      .filter(visible)
      .map(label => (label.innerText || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    return {
      fieldCount: controls.length,
      dropdownCount: controls.filter(el => el.tagName === 'SELECT').length,
      labels: [...new Set(labels)],
    };
  });
}

async function openNewApplication(page, guard) {
  await page.locator(NEW_APP_LINK).first().click();

  try {
    await page.waitForFunction(() => window.location.hash.startsWith('#/application'), null, { timeout: 30_000 });
    await page.getByText(FORM_HEADING, { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 45_000 });
    await page.getByText(FIRST_FIELD_LABEL).filter({ visible: true }).first().waitFor({ timeout: 45_000 });
  } catch (err) {
    const blocked = guard.blocked.length ? ` — write guard blocked: ${guard.blocked.join(', ')}` : '';
    throw new Error(`OnDeck New App form did not open (${err.message.split('\n')[0]}) (on ${page.url()})${blocked}`);
  }

  const form = await summariseForm(page);
  if (!form.fieldCount) {
    throw new Error(`OnDeck New App page opened but no form fields are visible (on ${page.url()})`);
  }

  console.log(`New App form ready — ${form.fieldCount} visible fields (${form.dropdownCount} dropdowns). URL: ${page.url()}`);
  console.log(`Form labels: ${form.labels.join(' | ')}`);
  return { ...form, url: page.url() };
}

async function loginAndOpenForm(page, context) {
  await login(page);
  const guard = await installWriteGuard(context);
  const form = await openNewApplication(page, guard);
  return { guard, form };
}

function hasValues(contact) {
  return Boolean(contact) && Object.values(contact).some(value => value !== null && value !== undefined && value !== '');
}

async function populate(page, businessData, contact1Data, contact2Data) {
  const demo = businessData?.demo === true;
  const data = demo ? TEST_DATA : businessData;
  const owners = demo ? [TEST_CONTACT, TEST_CONTACT_2] : [contact1Data, contact2Data].filter(hasValues);
  console.log(`Populating the New App form${demo ? ' with TEST data' : ''} — ${owners.length} owner(s)`);
  return fillApplicationForm(page, data, owners);
}

function summarise(fill) {
  const parts = [`${fill.filled.length} fields filled`];
  if (fill.skipped.length) parts.push(`${fill.skipped.length} skipped (no value)`);
  if (fill.problems.length) parts.push(`${fill.problems.length} problem(s): ${fill.problems.join('; ')}`);
  if (fill.invalidFields.length) parts.push(`portal still marks invalid: ${fill.invalidFields.join(', ')}`);
  return parts.join(' — ');
}

function isOnDeckSubmitAllowed() {
  const value = process.env[ONDECK_SUBMIT_ENV_VAR];
  return typeof value === 'string' && value.trim().toLowerCase() === 'true';
}

function submitBlockReason(sandbox, demo) {
  if (demo) return 'demo payload';
  if (sandbox) return 'sandbox payload';
  if (!isSubmitAllowed()) return `${SUBMIT_ENV_VAR} is not "true"`;
  if (!isOnDeckSubmitAllowed()) return `${ONDECK_SUBMIT_ENV_VAR} is not "true"`;
  return null;
}

function assertReadyToSubmit(fill) {
  const issues = [...fill.problems];
  if (fill.invalidFields.length) issues.push(`portal marks invalid: ${fill.invalidFields.join(', ')}`);
  if (!fill.formValid) issues.push('the portal does not consider the form complete');
  if (issues.length) {
    throw new Error(`OnDeck: Continue NOT clicked — the form is not ready: ${[...new Set(issues)].join('; ')}`);
  }
}

function declineNotes(decision) {
  if (decision.reasons.length) return decision.reasons.join('\n');
  return decision.banner || `Declined (stage: ${decision.stage || 'unknown'})`;
}

function opportunityIdOf(businessData, recordId) {
  const id = businessData?.opportunityId;
  return id && id !== recordId ? id : null;
}

async function recordDecline(recordId, opportunityId, decision, sandbox) {
  if (!decision?.declined) return null;
  if (!recordId) {
    console.log('OnDeck declined the application, but there is no submissionId — no offer created');
    return { created: false, reason: 'no submissionId' };
  }
  try {
    return { created: true, ...(await createDeclinedOffer(recordId, declineNotes(decision), { opportunityId, sandbox })) };
  } catch (err) {
    const reason = err.message.split('\n')[0];
    console.log(`Declined offer could not be created in Salesforce: ${reason}`);
    return { created: false, reason };
  }
}

function describeOutcome(fill, submission, decision, offer) {
  if (!submission.submitted) {
    return `New App form populated — ${summarise(fill)}. Continue was NOT clicked (${submission.blockedBy}), NOT submitted.`;
  }
  const parts = [`Application SUBMITTED to OnDeck (Continue clicked) — ${submission.submitVerified ? 'confirmed' : 'NOT confirmed'}`];
  if (decision?.stage) parts.push(`stage "${decision.stage}"`);
  if (decision?.declined) parts.push(`declined: ${declineNotes(decision).replace(/\n/g, '; ')}`);
  if (offer?.created) parts.push(`Declined offer ${offer.id} created`);
  if (offer && !offer.created) parts.push(`Declined offer NOT created: ${offer.reason}`);
  return `${parts.join(' — ')}.`;
}

async function uploadToSalesforce(page, recordId, title, sandbox = false) {
  if (!recordId) {
    console.log('No submissionId in payload, skipping screenshot upload');
    return null;
  }
  try {
    const png = await page.screenshot({ fullPage: true });
    const result = await uploadScreenshot(png.toString('base64'), title, recordId, sandbox);
    console.log(`Screenshot uploaded to Salesforce ${recordId}: ${title}`);
    return result;
  } catch (err) {
    const reason = err.message.split('\n')[0];
    console.log(`Screenshot upload failed (ignored): ${reason}`);
    return { uploaded: false, reason };
  }
}

async function submitLoan(businessData, contact1Data, contact2Data) {
  assertConfigured();

  const recordId = businessData?.salesforceRecordId || businessData?.opportunityId || null;
  const sandbox = isSandbox(businessData);
  if (sandbox) console.log('SANDBOX payload — Salesforce sandbox credentials will be used and the application will NOT be submitted');

  const { browser, context } = await launch();

  let page;
  try {
    page = await context.newPage();
    const { guard } = await loginAndOpenForm(page, context);
    const fill = await populate(page, businessData, contact1Data, contact2Data);

    const blockedBy = submitBlockReason(sandbox, businessData?.demo === true);
    let submission = { submitted: false, submitVerified: false, confirmation: null, blockedBy };
    let decision = null;

    if (blockedBy) {
      console.log(`OnDeck: submit step SKIPPED (${blockedBy}) — Continue was not clicked`);
    } else {
      assertReadyToSubmit(fill);
      await uploadToSalesforce(page, recordId, `OnDeck - Form populated (before submit) - ${businessData?.businessName || 'Demo'}`, sandbox);
      guard.allowWrites();
      const holder = {};
      submission = await maybeSubmit(page.locator(CONTINUE_BUTTON), page, {
        lender: 'OnDeck',
        buttonLabel: 'Continue',
        confirm: confirmOnDeckSubmit(holder),
        sandbox,
      });
      decision = holder.decision || null;
    }

    const offer = submission.submitted ? await recordDecline(recordId, opportunityIdOf(businessData, recordId), decision, sandbox) : null;

    const screenshot = await uploadToSalesforce(
      page,
      recordId,
      submission.submitted
        ? `OnDeck - Final - after submit${decision?.stage ? ` (${decision.stage})` : ''} - ${businessData?.businessName || 'Demo'}`
        : `OnDeck - Form populated (not submitted) - ${businessData?.businessName || 'Demo'}`,
      sandbox
    );

    return {
      success: true,
      message: describeOutcome(fill, submission, decision, offer),
      applicationUrl: submission.submitted ? decision?.url || page.url() : undefined,
      fill,
      decision,
      offer,
      blockedRequests: guard.blocked,
      submitted: submission.submitted,
      submitVerified: submission.submitVerified,
      submitConfirmation: submission.confirmation,
      screenshot,
    };
  } catch (err) {
    if (page && recordId) {
      await uploadToSalesforce(page, recordId, `OnDeck Error Screenshot - ${new Date().toISOString()}`, sandbox);
    }
    throw err;
  } finally {
    await browser.close();
  }
}

async function dumpFields(page) {
  return page.evaluate(() => {
    const clean = text => (text || '').replace(/\s+/g, ' ').trim();
    const visible = el => el.offsetParent !== null;
    const skippedAttributes = new Set(['value', 'style']);

    const attributesOf = el => Object.fromEntries(
      [...el.attributes]
        .filter(attribute => !skippedAttributes.has(attribute.name))
        .map(attribute => [attribute.name, attribute.value])
    );

    const labelFor = el => {
      const direct = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
      const label = direct || el.closest('label') || el.closest('.form-group')?.querySelector('label');
      return label ? clean(label.innerText) : null;
    };

    const fields = [];
    let section = null;
    for (const el of document.querySelectorAll('h1, h2, h3, h4, h5, legend, input, select, textarea, .ui-select-container')) {
      if (/^(H[1-5]|LEGEND)$/.test(el.tagName)) {
        if (visible(el) && clean(el.innerText)) section = clean(el.innerText);
        continue;
      }
      if (el.type === 'hidden') continue;
      fields.push({
        index: fields.length,
        section,
        label: labelFor(el),
        tag: el.tagName.toLowerCase(),
        visible: visible(el),
        disabled: el.disabled === true,
        required: el.required === true || el.getAttribute('aria-required') === 'true' || el.hasAttribute('ng-required'),
        attributes: attributesOf(el),
        options: el.tagName === 'SELECT'
          ? [...el.options].map(option => ({ text: clean(option.text), value: option.value, selected: option.selected }))
          : undefined,
      });
    }

    const buttons = [...document.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn, [ng-click]')]
      .filter(visible)
      .map(el => ({
        tag: el.tagName.toLowerCase(),
        text: clean(el.innerText || el.value),
        disabled: el.disabled === true,
        attributes: attributesOf(el),
      }));

    const forms = [...document.querySelectorAll('form')].map(attributesOf);

    const body = document.body.cloneNode(true);
    for (const el of body.querySelectorAll('script, style, svg, noscript, link, iframe')) el.remove();
    const html = body.innerHTML
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 600_000);

    return { fields, buttons, forms, html };
  });
}

async function inspect({ fill = false } = {}) {
  assertConfigured();
  const { browser, context } = await launch();

  try {
    const page = await context.newPage();
    const { guard, form } = await loginAndOpenForm(page, context);
    const fillReport = fill ? await populate(page, { demo: true }) : undefined;
    const dump = await dumpFields(page);
    console.log(`Dumped ${dump.fields.length} fields and ${dump.buttons.length} buttons — Continue was not clicked.`);

    return {
      success: true,
      url: form.url,
      title: await page.title(),
      labels: form.labels,
      fill: fillReport,
      blockedRequests: guard.blocked,
      ...dump,
    };
  } finally {
    await browser.close();
  }
}

async function screenshot({ fill = false } = {}) {
  assertConfigured();
  const { browser, context } = await launch();

  try {
    const page = await context.newPage();
    let outcome = 'form-open';
    try {
      const { guard } = await loginAndOpenForm(page, context);
      if (fill) {
        const fillReport = await populate(page, { demo: true });
        const blocked = guard.blocked.length ? ` — blocked requests: ${guard.blocked.join(', ')}` : '';
        outcome = `form-filled: ${summarise(fillReport)}${blocked}`;
      }
    } catch (err) {
      outcome = `failed: ${err.message.split('\n')[0]}`;
      console.log(`OnDeck screenshot — capturing the page as-is after: ${err.message}`);
    }
    const png = await page.screenshot({ fullPage: true });
    return { png, outcome };
  } finally {
    await browser.close();
  }
}

module.exports = { submitLoan, inspect, screenshot };
