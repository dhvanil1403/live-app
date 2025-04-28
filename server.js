const puppeteer = require('puppeteer');
const admin = require('firebase-admin');

// Parse the Firebase credentials from environment variables
const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://aekads-88e11-default-rtdb.firebaseio.com/"
});

const db = admin.database();
const PORT = process.env.PORT || 3000;

async function scrapeAndPush() {
  const url = `https://www.cricketmazza.com/live/2236`;

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 0 });
    await page.waitForSelector('li.active', { timeout: 5000 });

    const data = await page.evaluate(() => {
      const getText = (selector) => {
        const el = document.querySelector(selector);
        return el ? el.innerText.trim() : '';
      };

      const getScores = () => {
        const teams = document.querySelectorAll('div.d-flex.justify-content-center.text-white div.p-2');
        return Array.from(teams)
          .map(team => {
            const teamName = team.querySelector('span.score-name')?.innerText.trim() || '';
            const score = team.querySelector('h3')?.innerText.trim().split(' ')[0] || '';
            return { team: teamName, score };
          })
          .filter(item => item.team && item.score);
      };

      const getBatters = () => {
        const rows = document.querySelectorAll('.live-batsman:nth-of-type(1) tbody tr');
        return Array.from(rows).map(row => {
          const cols = row.querySelectorAll('td');
          if (cols.length < 6) return null;
          const playerNameRaw = cols[0].innerText.trim();
          const isStriker = playerNameRaw.includes('*') ? '1' : '0';
          const name = playerNameRaw.replace(/[.]/g, '').trim();
          return {
            name,
            runs: cols[1].innerText.trim(),
            balls: cols[2].innerText.trim(),
            fours: cols[3].innerText.trim(),
            sixes: cols[4].innerText.trim(),
            strikeRate: cols[5].innerText.trim(),
            isStriker
          };
        }).filter(Boolean);
      };

      const getBowlers = () => {
        const rows = document.querySelectorAll('.live-batsman:nth-of-type(2) tbody tr');
        return Array.from(rows).map(row => {
          const cols = row.querySelectorAll('td');
          if (cols.length < 6) return null;
          return {
            name: cols[0].innerText.trim(),
            overs: cols[1].innerText.trim(),
            maidens: cols[2].innerText.trim(),
            runs: cols[3].innerText.trim(),
            wickets: cols[4].innerText.trim(),
            economy: cols[5].innerText.trim()
          };
        }).filter(Boolean);
      };

      const getLastOver = () => {
        const overElement = document.querySelector('.live-batsman-ball.ball-run ul');
        return overElement ? overElement.innerText.replace(/\s+/g, ' ').trim() : '';
      };

      return {
        matchTitle: getText('li.active'),
        matchStatus: getText('.winning-run p'),
        currentScore: getScores(),
        batters: getBatters(),
        bowlers: getBowlers(),
        lastOver: getLastOver(),
        lastUpdated: new Date().toISOString()
      };
    });

    const ref = db.ref('Livematch/nmpl_2025_26_26th_match');
    await ref.set(data);

    console.log('✅ Data scraped and pushed at', new Date().toISOString());
  } catch (error) {
    console.error('❌ Scraping Error:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// First run
scrapeAndPush();

// Then run every 10 seconds
setInterval(scrapeAndPush, 10000);
