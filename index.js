#!/usr/bin/env node

const { chromium } = require('playwright');

async function main() {
  console.log('🔑 NRK Token Helper for Home Assistant');
  console.log('========================================\n');
  console.log('Opening browser... Log in to your NRK account.\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Set up network interception BEFORE navigating — catch tokenforsub responses
  let interceptedSession = null;
  page.on('response', async (response) => {
    try {
      if (response.url().includes('/auth/session/tokenforsub/') && response.status() === 200) {
        interceptedSession = await response.json();
      }
    } catch {}
  });

  await page.goto('https://tv.nrk.no');

  console.log('⏳ Waiting for you to log in at tv.nrk.no...\n');

  // Poll for login + session data
  let attempts = 0;
  while (!interceptedSession && attempts < 300) {
    await page.waitForTimeout(2000);
    attempts++;

    // Check if logged in
    const cookies = await context.cookies('https://tv.nrk.no');
    const authFlag = cookies.find(c => c.name === 'nrk-auth-flag' && c.value === '1');

    if (authFlag && !interceptedSession) {
      console.log('✅ Login detected! Waiting for session data...\n');

      // After login, tv.nrk.no should auto-call tokenforsub — wait a bit
      await page.waitForTimeout(5000);

      if (!interceptedSession) {
        // Force a page reload to trigger the session call
        console.log('   Reloading page to fetch session...');
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForTimeout(5000);
      }

      if (!interceptedSession) {
        // Last resort: extract userId from page and call tokenforsub manually
        console.log('   Trying manual extraction...');
        const result = await page.evaluate(async () => {
          // Find userId from performance entries or page content
          const entries = performance.getEntriesByType('resource').map(e => e.name);
          
          // Look for tokenforsub URL (contains the sub/userId)
          for (const url of entries) {
            const m = url.match(/tokenforsub\/([^?/]+)/);
            if (m) return { sub: m[1], source: 'tokenforsub' };
          }

          // Look for features URL with userId param
          for (const url of entries) {
            const m = url.match(/userId=([^&]+)/);
            if (m) return { featuresUserId: m[1], source: 'features' };
          }

          // Look for profilesettings URL
          for (const url of entries) {
            const m = url.match(/profilesettings\.nrk\.no\/tv\/([^?/]+)/);
            if (m) return { sub: m[1], source: 'profilesettings' };
          }

          return { entries: entries.filter(e => e.includes('nrk.no')).slice(0, 20) };
        });

        if (result.sub) {
          // Call tokenforsub with the found sub
          const session = await page.evaluate(async (sub) => {
            const resp = await fetch(`/auth/session/tokenforsub/${sub}`, {
              method: 'POST',
              credentials: 'include',
            });
            if (resp.ok) return resp.json();
            return null;
          }, result.sub);

          if (session) interceptedSession = session;
        } else if (result.featuresUserId) {
          // We have the features userId but need the OIDC sub
          // Try to find it from the page's session state
          const session = await page.evaluate(async () => {
            // The page might have called tokenforsub already — check if there's
            // session info in the DOM or JS state
            const scripts = document.querySelectorAll('script[type="application/json"]');
            for (const s of scripts) {
              try {
                const d = JSON.parse(s.textContent);
                // Walk the object looking for 'sub' fields that look like UUIDs
                const json = JSON.stringify(d);
                const m = json.match(/"sub"\s*:\s*"([a-f0-9-]{36})"/);
                if (m) {
                  const resp = await fetch(`/auth/session/tokenforsub/${m[1]}`, {
                    method: 'POST',
                    credentials: 'include',
                  });
                  if (resp.ok) return resp.json();
                }
              } catch {}
            }
            return null;
          });

          if (session) interceptedSession = session;
        }
      }

      // If we still don't have session data, break and report
      break;
    }
  }

  if (interceptedSession) {
    const cookies = await context.cookies('https://tv.nrk.no');
    const sidCookie = cookies.find(c => c.name === 'nrk-user-sid');
    outputResults({
      session: interceptedSession,
      cookies: { 'nrk-user-sid': sidCookie?.value || null },
    });
  } else {
    console.error('❌ Could not extract session data.');
    console.error('   Make sure you completed the login at tv.nrk.no.\n');
  }

  console.log('\nPress Enter to close the browser...');
  await new Promise(resolve => process.stdin.once('data', resolve));
  await browser.close();
}

function outputResults(data) {
  const session = data.session || data;
  const identities = session?.session?.identities || session?.identities || [];
  const mainUser = session?.session?.user || session?.user || {};

  console.log('👤 Logged in as:', mainUser.name || 'Unknown');
  console.log('📧 Email:', mainUser.email || 'Unknown');
  console.log('\n📋 Profiles found:');

  const profiles = identities.map(id => ({
    id: id.sub,
    name: id.name,
    type: id.profileType,
    avatar: id.avatar || null,
    color: id.color || null,
    age_limit: id.ageLimit || null,
  }));

  profiles.forEach(p => {
    console.log(`   ${p.type === 'Child' ? '👶' : '👤'} ${p.name} (${p.type}) - ${p.id}`);
  });

  const output = {
    user_id: mainUser.sub || data.userId,
    session_cookie: data.cookies?.['nrk-user-sid'] || null,
    profiles,
  };

  console.log('\n' + '='.repeat(60));
  console.log('📋 Copy this JSON into your Home Assistant NRK TV config:\n');
  console.log(JSON.stringify(output, null, 2));
  console.log('\n' + '='.repeat(60));
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
