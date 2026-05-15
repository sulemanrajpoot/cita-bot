const { chromium } = require('playwright');
const nodemailer = require('nodemailer');

const CONFIG = {
  name: 'SULEMAN AKHTAR',
  nie: 'Z2543963F',
  nationality: 'PAKISTAN',
  email: 'suleman.rajpoot@gmail.com',
  checkIntervalMinutes: 3,
};

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

async function sendEmail(subject, html) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });
  try {
    await transporter.sendMail({ from: EMAIL_USER, to: CONFIG.email, subject, html });
    console.log('📧 Email sent!');
  } catch (err) {
    console.error('Email failed:', err.message);
  }
}

const BARCELONA_STATIONS = [
  'BARCELONA','BADALONA','CORNELLA DE LLOBREGAT','GRANOLLERS',
  'IGUALADA','MANRESA','MATARO','MOLLET DEL VALLES','SABADELL',
  'SANT FELIU DE LLOBREGAT','TERRASSA','VILAFRANCA DEL PENEDES',
  'VILANOVA I LA GELTRU','HOSPITALET DE LLOBREGAT','CERDANYOLA DEL VALLES',
  'RUBI','SANT BOI DE LLOBREGAT','SANT CUGAT DEL VALLES','CASTELLDEFELS','GAVA',
];

async function clickAceptar(page) {
  try {
    await page.waitForTimeout(1000);
    const btn = (await page.$('input[value="Aceptar"]')) || (await page.$('input[value="ACEPTAR"]')) || (await page.$('button:has-text("Aceptar")')) || (await page.$('[id*="btnAceptar"]'));
    if (btn) await btn.click();
    await page.waitForTimeout(1500);
  } catch (e) {}
}

async function takeScreenshot(page) {
  try {
    const buf = await page.screenshot({ fullPage: false });
    return buf.toString('base64');
  } catch (e) { return null; }
}

async function tryBookStation(page, stationName) {
  console.log(`\n🔍 Trying station: ${stationName}`);
  try {
    await page.goto('https://icp.administracionelectronica.gob.es/icpplus/index.html', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    try {
      await page.waitForSelector('select', { timeout: 10000 });
      await page.selectOption('select', { label: /barcelona/i });
      await page.waitForTimeout(1500);
    } catch (e) { return 'error'; }
    await clickAceptar(page);

    try {
      await page.waitForSelector('select', { timeout: 10000 });
      const options = await page.$$eval('select option', opts => opts.map(o => ({ value: o.value, text: o.textContent.trim() })));
      const match = options.find(o => o.text.toUpperCase().includes(stationName.toUpperCase()));
      if (!match) return 'error';
      await page.selectOption('select', match.value);
      await page.waitForTimeout(1500);
    } catch (e) { return 'error'; }
    await clickAceptar(page);

    try {
      await page.waitForSelector('select, input[type="radio"]', { timeout: 10000 });
      let selected = false;
      const radios = await page.$$('input[type="radio"]');
      for (const radio of radios) {
        const label = await radio.evaluate(el => { const lbl = document.querySelector(`label[for="${el.id}"]`); return lbl ? lbl.textContent : ''; });
        if (/huella|fingerprint/i.test(label)) { await radio.click(); selected = true; break; }
      }
      if (!selected) {
        const selects = await page.$$('select');
        for (const sel of selects) {
          const texts = await sel.$$eval('option', opts => opts.map(o => o.textContent));
          if (texts.some(t => /huella/i.test(t))) { await sel.selectOption({ label: /huella/i }); selected = true; break; }
        }
      }
      if (!selected) return 'error';
    } catch (e) { return 'error'; }
    await clickAceptar(page);

    try {
      await page.waitForTimeout(1500);
      const sinClave = (await page.$('a:has-text("Sin Cl@ve")')) || (await page.$('[id*="sinClave"]')) || (await page.$('input[value*="Sin"]'));
      if (sinClave) { await sinClave.click(); }
      else {
        const links = await page.$$('a, button, input[type="button"], input[type="submit"]');
        for (const link of links) {
          const txt = await link.evaluate(el => (el.textContent || el.value || '').toLowerCase());
          if (txt.includes('sin cl')) { await link.click(); break; }
        }
      }
      await page.waitForTimeout(2000);
    } catch (e) {}

    try {
      await page.waitForSelector('input[type="text"]', { timeout: 10000 });
      const nieField = (await page.$('input[id*="nie" i]')) || (await page.$('input[name*="nie" i]')) || (await page.$('input[id*="nif" i]'));
      if (nieField) await nieField.fill(CONFIG.nie);
      else { const inputs = await page.$$('input[type="text"]'); if (inputs[0]) await inputs[0].fill(CONFIG.nie); }
      await page.waitForTimeout(500);
      const nameField = (await page.$('input[id*="nombre" i]')) || (await page.$('input[name*="nombre" i]'));
      if (nameField) await nameField.fill(CONFIG.name);
      else { const inputs = await page.$$('input[type="text"]'); if (inputs[1]) await inputs[1].fill(CONFIG.name); }
      await page.waitForTimeout(500);
      const natSelect = (await page.$('select[id*="pais" i]')) || (await page.$('select[id*="nacion" i]'));
      if (natSelect) { try { await natSelect.selectOption({ label: /pakistan/i }); } catch (e) {} }
    } catch (e) { return 'error'; }
    await clickAceptar(page);

    try {
      await page.waitForTimeout(1500);
      const citaBtn = (await page.$('input[value*="olicitar" i]')) || (await page.$('input[value*="Cita" i]')) || (await page.$('button:has-text("olicitar")')) || (await page.$('[id*="btnSolicitar"]'));
      if (citaBtn) await citaBtn.click();
      await page.waitForTimeout(3000);
    } catch (e) {}

    const pageText = await page.evaluate(() => document.body.innerText);
    const noSlots = /no hay cita|no existe|no disponible|no quedan|sin citas|no se han encontrado/i.test(pageText);
    if (noSlots) { console.log(`  ❌ No appointments at ${stationName}`); return 'not_found'; }

    console.log(`  ✅ Appointments found at ${stationName}! Trying to auto-book...`);

    try {
      const dateSelect = await page.$('select[id*="fecha" i]');
      if (dateSelect) {
        const dateOptions = await dateSelect.$$eval('option', opts => opts.filter(o => o.value).map(o => o.value));
        if (dateOptions.length > 0) { await dateSelect.selectOption(dateOptions[0]); await page.waitForTimeout(1500); }
      }
      const calendarDay = await page.$('td.celdaFecha:not(.bloqueada), td[class*="fecha"]:not([class*="bloquea"]), a[class*="fecha"]');
      if (calendarDay) { await calendarDay.click(); await page.waitForTimeout(1500); }
    } catch (e) {}

    try {
      const timeSelect = await page.$('select[id*="hora" i], select[id*="time" i]');
      if (timeSelect) {
        const timeOptions = await timeSelect.$$eval('option', opts => opts.filter(o => o.value).map(o => o.value));
        if (timeOptions.length > 0) { await timeSelect.selectOption(timeOptions[0]); await page.waitForTimeout(1500); }
      }
      const timeBtn = await page.$('input[id*="hora" i], button[class*="hora"], a[class*="hora"]');
      if (timeBtn) { await timeBtn.click(); await page.waitForTimeout(1500); }
    } catch (e) {}

    await clickAceptar(page);
    await page.waitForTimeout(2000);

    const newText = await page.evaluate(() => document.body.innerText);
    const hasCaptcha = /captcha|texto.*imagen|escriba.*letras|codigo.*seguridad/i.test(newText) || (await page.$('img[src*="captcha" i]')) !== null || (await page.$('input[id*="captcha" i]')) !== null;

    if (hasCaptcha) {
      console.log('  ⚠️  Captcha detected!');
      const screenshot = await takeScreenshot(page);
      const currentUrl = page.url();
      let emailHtml = `<h2>🔐 Almost There! Captcha Required</h2><p>Bot found appointment at <strong>${stationName}</strong> and filled all details!</p><ol><li>Open: <a href="${currentUrl}">${currentUrl}</a></li><li>Type the captcha</li><li>Tap Confirm</li></ol><p style="color:red;"><strong>Act within 5 minutes!</strong></p>`;
      if (screenshot) emailHtml += `<img src="data:image/png;base64,${screenshot}" style="max-width:100%"/>`;
      await sendEmail('🔐 Solve captcha to confirm your appointment!', emailHtml);
      return 'captcha';
    }

    try {
      const confirmBtn = (await page.$('input[value*="onfirm" i]')) || (await page.$('input[value*="Aceptar"]')) || (await page.$('button:has-text("Confirmar")')) || (await page.$('[id*="btnConfirmar"]'));
      if (confirmBtn) { await confirmBtn.click(); await page.waitForTimeout(3000); }
    } catch (e) {}

    const finalText = await page.evaluate(() => document.body.innerText);
    const isConfirmed = /confirmad|reservad|su cita|localizador|justificante/i.test(finalText);

    if (isConfirmed) {
      console.log('  🎉 BOOKING CONFIRMED!');
      const screenshot = await takeScreenshot(page);
      let emailHtml = `<h2>🎉 YOUR APPOINTMENT IS BOOKED!</h2><p><strong>Station:</strong> ${stationName}</p><p><strong>Name:</strong> ${CONFIG.name}</p><p><strong>NIE:</strong> ${CONFIG.nie}</p><p style="color:green;"><strong>Save your confirmation number!</strong></p>`;
      if (screenshot) emailHtml += `<img src="data:image/png;base64,${screenshot}" style="max-width:100%"/>`;
      await sendEmail('🎉 APPOINTMENT BOOKED! Fingerprint cita confirmed', emailHtml);
      return 'booked';
    }

    await sendEmail('⚡ Appointment found - please complete booking!', `<h2>⚡ Appointment at ${stationName}!</h2><p>Bot needs you to finish the booking. Open the website now!</p><p style="color:red;"><strong>Act within 5 minutes!</strong></p>`);
    return 'captcha';

  } catch (err) { console.log(`  ⚠️  Error: ${err.message}`); return 'error'; }
}

async function runBot() {
  console.log('🤖 Cita Bot started!');
  console.log(`📋 Name: ${CONFIG.name} | NIE: ${CONFIG.nie} | Email: ${CONFIG.email}`);
  let cycleCount = 0;
  while (true) {
    cycleCount++;
    console.log(`\n🔄 === CYCLE ${cycleCount} — ${new Date().toLocaleString()} ===`);
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    for (const station of BARCELONA_STATIONS) {
      const result = await tryBookStation(page, station);
      if (result === 'booked') { console.log('\n🎉 BOOKED!'); await browser.close(); process.exit(0); }
      if (result === 'captcha') { console.log('\n📧 Email sent.'); await browser.close(); process.exit(0); }
      await new Promise(r => setTimeout(r, 4000));
    }
    await browser.close();
    console.log(`\n✅ Cycle ${cycleCount} done. Waiting ${CONFIG.checkIntervalMinutes} min...`);
    await new Promise(r => setTimeout(r, CONFIG.checkIntervalMinutes * 60 * 1000));
  }
}

runBot().catch(err => { console.error('Fatal error:', err); process.exit(1); });
