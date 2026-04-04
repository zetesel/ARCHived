const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto('http://localhost:8000/index.html', { waitUntil: 'networkidle' });

    // Wait for projects container to render (or for loading to be visible)
    await page.waitForSelector('#projects-container');

    // Check that page scripts loaded
    const scriptStatus = await page.evaluate(() => {
      return {
        hasSanitize: typeof sanitizeUrl === 'function',
        hasFormat: typeof formatDateAgo === 'function',
      };
    });

    if (!scriptStatus.hasSanitize || !scriptStatus.hasFormat) {
      console.error('Required frontend helpers are missing');
      process.exit(2);
    }

    // Click the first link if present (does not navigate due to noopener)
    const firstLink = await page.$('.project-name');
    if (firstLink) {
      await firstLink.click();
    }

    // Check pagination controls
    const pageInfo = await page.$eval('#page-info', el => el.textContent);
    console.log('Page info:', pageInfo);

    console.log('Frontend smoke tests passed');
    await browser.close();
    process.exit(0);
  } catch (e) {
    console.error('Frontend smoke failed:', e);
    await browser.close();
    process.exit(3);
  }
})();
