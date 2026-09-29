const MODAL_TEXT = 'text=/Already Pre-Qualified|pre-qualification expires|lose your spot/i';
const CLOSE_BUTTON = 'button[aria-label="Close"]';
const CONTINUE_BUTTON = 'button:has-text("Continue & Secure My Offer")';

async function isInterstitialVisible(frame) {
  return frame.locator(MODAL_TEXT).first().isVisible({ timeout: 1_000 }).catch(() => false);
}

async function dismissInterstitial(frame, page, when) {
  if (!(await isInterstitialVisible(frame))) return false;

  console.log(`Kudo interstitial modal detected ${when} — dismissing it`);

  const close = frame.locator(CLOSE_BUTTON).first();
  if (await close.isVisible().catch(() => false)) {
    await close.click().catch(() => {});
  } else {
    const keepGoing = frame.locator(CONTINUE_BUTTON).first();
    if (await keepGoing.isVisible().catch(() => false)) await keepGoing.click().catch(() => {});
    else await page.keyboard.press('Escape').catch(() => {});
  }

  await page.waitForTimeout(1_000);

  if (await isInterstitialVisible(frame)) {
    console.log('Kudo interstitial still on screen — trying "Continue & Secure My Offer"');
    await frame.locator(CONTINUE_BUTTON).first().click().catch(() => {});
    await page.waitForTimeout(1_000);
  }

  const gone = !(await isInterstitialVisible(frame));
  console.log(gone ? 'Kudo interstitial dismissed' : 'WARNING — Kudo interstitial could not be dismissed');
  return gone;
}

module.exports = { dismissInterstitial, isInterstitialVisible };
