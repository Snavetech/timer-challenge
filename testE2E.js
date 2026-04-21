const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page1 = await browser.newPage();
  
  page1.on('console', msg => console.log('PAGE1 LOG:', msg.text()));
  page1.on('pageerror', error => console.error('PAGE1 ERROR:', error.message));
  
  await page1.goto('http://localhost:3000');
  
  // Create Room as host
  await page1.type('#create-username', 'Host');
  await page1.click('.mode-option[data-mode="whot"]');
  await page1.click('#form-create button[type="submit"]');
  
  await page1.waitForSelector('#lobby-room-code');
  const codeText = await page1.$eval('#lobby-room-code', el => el.textContent);
  console.log('Room created:', codeText);

  // Player 2 joins
  const page2 = await browser.newPage();
  page2.on('console', msg => console.log('PAGE2 LOG:', msg.text()));
  page2.on('pageerror', error => console.error('PAGE2 ERROR:', error.message));
  
  await page2.goto('http://localhost:3000');
  await page2.click('#btn-join');
  await page2.type('#join-username', 'Player2');
  await page2.type('#join-code', codeText);
  await page2.click('#form-join button[type="submit"]');
  
  // Wait for player to appear in lobby
  await page1.waitForFunction(() => {
    return document.querySelectorAll('#lobby-players .player-card').length === 2;
  });
  
  console.log('Both players in lobby. Clicking Start Game.');
  
  // Click start game on Host
  await page1.click('#btn-start-game');
  
  // Wait to see what happens
  await new Promise(r => setTimeout(r, 2000));
  
  const isWhotViewActive1 = await page1.evaluate(() => document.getElementById('view-game-whot').classList.contains('active'));
  const isWhotViewActive2 = await page2.evaluate(() => document.getElementById('view-game-whot').classList.contains('active'));
  
  console.log('Host Whot View Active:', isWhotViewActive1);
  console.log('Player Whot View Active:', isWhotViewActive2);
  
  await browser.close();
})();
