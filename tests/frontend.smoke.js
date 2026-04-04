const { chromium } = require('playwright');

function isHttpScheme(href) {
  try {
    const u = new URL(href);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto('http://localhost:8000/index.html', { waitUntil: 'networkidle' });

    // Wait for projects container to render
    await page.waitForSelector('#projects-container');

    // Ensure helpers exist on the page
    const scriptStatus = await page.evaluate(() => ({
      hasSanitize: typeof sanitizeUrl === 'function',
      hasFormat: typeof formatDateAgo === 'function'
    }));
    if (!scriptStatus.hasSanitize || !scriptStatus.hasFormat) {
      console.error('Required frontend helpers missing');
      await browser.close();
      process.exit(2);
    }

    // Select a project card if present
    const card = await page.$('.project-card');
    if (!card) {
      console.warn('No project cards found — dataset may be empty. Frontend static checks continue.');
    } else {
      // For the first card check the project link, view button and interest button
      const nameLink = await card.$('.project-name');
      const viewBtn = await card.$('.btn.btn-primary');
      const interestBtn = await card.$('.btn.btn-secondary');

      // Helper to inspect an anchor element
      async function inspectAnchor(el, expectIssue = false) {
        const props = await el.evaluate(node => ({ href: node.href, rel: node.rel, target: node.target }));
        // href may be absolute or '#'
        if (props.href === '' || props.href.endsWith('#')) {
          // safe fallback — clicking should not open a popup
          const [popup] = await Promise.all([
            page.waitForEvent('popup', { timeout: 500 }).catch(() => null),
            el.click()
          ]);
          if (popup) {
            throw new Error('Click on fallback link unexpectedly opened a popup');
          }
          return props;
        }

        // Ensure scheme is http(s)
        if (!isHttpScheme(props.href)) {
          throw new Error(`Unsafe link scheme: ${props.href}`);
        }

        // rel should include noopener and noreferrer when target=_blank
        if (props.target === '_blank') {
          if (!(props.rel && props.rel.includes('noopener') && props.rel.includes('noreferrer'))) {
            throw new Error(`Missing rel=noopener noreferrer on ${props.href}`);
          }
        }

        // Click and assert popup's opener is null (reverse-tabnabbing defense)
        const [popup] = await Promise.all([
          page.waitForEvent('popup', { timeout: 2000 }).catch(() => null),
          el.click()
        ]);
        if (popup) {
          // Evaluate opener in the popup. If rel=noopener was honored, opener should be null
          const openerIsNull = await popup.evaluate(() => window.opener === null).catch(() => true);
          if (!openerIsNull) {
            throw new Error('Popup has non-null opener — noopener may not be applied');
          }
          await popup.close();
        }

        if (expectIssue) {
          const u = new URL(props.href);
          if (!u.pathname.endsWith('/issues/new')) {
            throw new Error('Interest link does not point to /issues/new: ' + props.href);
          }
          if (!u.searchParams.get('title')) {
            throw new Error('Interest link missing title param');
          }
        }

        return props;
      }

      if (nameLink) await inspectAnchor(nameLink, false);
      if (viewBtn) await inspectAnchor(viewBtn, false);
      if (interestBtn) await inspectAnchor(interestBtn, true);
    }

    // Basic pagination state check
    const pageInfo = await page.$eval('#page-info', el => el.textContent.trim());
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
