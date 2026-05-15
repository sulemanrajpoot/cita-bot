const { chromium } = require('playwright');
const nodemailer = require('nodemailer');

// ============================================================
// YOUR PERSONAL DETAILS
// ============================================================
const CONFIG = {
  name: 'SULEMAN AKHTAR',
  nie: 'Z2543963F',
  nationality: 'PAKISTAN',
  email: 'suleman.rajpoot@gmail.com',
  checkIntervalMinutes: 3, // wait between full cycles
};

// ============================================================
// EMAIL SETUP (uses Gmail SMTP via app password)
// ============================================================
const EMAIL_USER = process.env.EMAIL_USER;   // set in Railway env vars
const EMAIL_PASS = process.env.EMAIL_PASS;   // set in Railway env vars

async function sendNotification(stationName, message) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: EMAIL_USER,
    to: CONFIG.email,
    subject: '🚨 CITA FOUND! Book Now - Fingerprint Barcelona',
    html: `
      <h2>✅ Appointment Available!</h2>
      <p><strong>Station:</strong> ${stationName}</p>
      <p><strong>Details:</strong> ${message}</p>
      <p><strong>Action:</strong> Go to <a href="https://icp.administracionelectronica.gob.es/icpplus/index.html">this link</a> and book immediately!</p>
      <p style="color:red;"><strong>⚠️ Act fast — appointments get taken within minutes!</strong></p>
      <hr/>
      <p>NIE: ${CONFIG.nie} | Name: ${CONFIG.name}</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('📧 Email notification sent!');
  } catch (err) {
    console.error('Email failed:', err.message);
  }
}

// ============================================================
// ALL BARCELONA POLICE STATIONS (oficinas)
// These are the known stations for Barcelona province
// ============================================================
const BARCELONA_STATIONS = [
  'BARCELONA',
  'BADALONA',
  'CORNELLA DE LLOBREGAT',
  'GRANOLLERS',
  'IGUALADA',
  'MANRESA',
  'MATARO',
  'MOLLET DEL VALLES',
  'SABADELL',
  'SANT FELIU DE LLOBREGAT',
  'TERRASSA',
  'VILAFRANCA DEL PENEDES',
  'VILANOVA I LA GELTRU',
  'HOSPITALET DE LLOBREGAT',
  'CERDANYOLA DEL VALLES',
  'RUBI',
  'SANT BOI DE LLOBREGAT',
  'SANT CUGAT DEL VALLES',
  'CASTELLDEFELS',
  'GAVA',
];

// ============================================================
// MAIN BOT FUNCTION
// ============================================================
async function checkStation(page, stationName) {
  console.log(`\n🔍 Checking station: ${stationName}`);

  try {
    // Step 1: Go to main page
    await page.goto('https://icp.administracionelectronica.gob.es/icpplus/index.html', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    await page.waitForTimeout(2000);

    // Step 2: Select Barcelona province
    const provinceSelect = await page.$('select#form');
    if (!provinceSelect) {
      // Try to find province selector
      await page.waitForSelector('select', { timeout: 10000 });
    }

    // Select Barcelona from province dropdown
    await page.selectOption('select', { label: /barcelona/i });
    await page.waitForTimeout(1500);

    // Click Accept/Aceptar button
    const acceptBtn = await page.$('input[value="Aceptar"]') || 
                      await page.$('button:has-text("Aceptar")') ||
                      await page.$('[id*="btnAceptar"]');
    if (acceptBtn) await acceptBtn.click();
    await page.waitForTimeout(2000);

    // Step 3: Select the station (oficina)
    try {
      await page.waitForSelector('select', { timeout: 10000 });
      const options = await page.$$eval('select option', opts =>
        opts.map(o => ({ value: o.value, text: o.textContent.trim() }))
      );
      
      const match = options.find(o => 
        o.text.toUpperCase().includes(stationName.toUpperCase())
      );

      if (!match) {
        console.log(`  ⚠️  Station "${stationName}" not found in dropdown, skipping...`);
        return false;
      }

      await page.selectOption('select', match.value);
      await page.waitForTimeout(1500);
    } catch (e) {
      console.log(`  ⚠️  Could not select station: ${e.message}`);
      return false;
    }

    // Click Aceptar
    await clickAceptar(page);
    await page.waitForTimeout(2000);

    // Step 4: Select fingerprint procedure (Toma de huellas)
    try {
      await page.waitForSelector('select, input[type="radio"]', { timeout: 10000 });
      
      // Try to find and select fingerprint option
      const tramiteOptions = await page.$$('input[type="radio"]');
      let fingerPrintSelected = false;
      
      for (const radio of tramiteOptions) {
        const label = await radio.evaluate(el => {
          const lbl = document.querySelector(`label[for="${el.id}"]`);
          return lbl ? lbl.textContent : '';
        });
        if (/huella|fingerprint|toma de huella/i.test(label)) {
          await radio.click();
          fingerPrintSelected = true;
          break;
        }
      }

      if (!fingerPrintSelected) {
        // Try select dropdown
        const selects = await page.$$('select');
        for (const sel of selects) {
          const optTexts = await sel.$$eval('option', opts => opts.map(o => o.textContent));
          const hasFingerprint = optTexts.some(t => /huella|fingerprint/i.test(t));
          if (hasFingerprint) {
            await sel.selectOption({ label: /huella/i });
            fingerPrintSelected = true;
            break;
          }
        }
      }

      if (!fingerPrintSelected) {
        console.log('  ⚠️  Could not find fingerprint option, skipping...');
        return false;
      }
    } catch (e) {
      console.log(`  ⚠️  Procedure selection error: ${e.message}`);
      return false;
    }

    await clickAceptar(page);
    await page.waitForTimeout(2000);

    // Step 5: Click "Sin Cl@ve" (without clave/certificate)
    try {
      const sinClaveBtn = await page.$('a:has-text("Sin Cl@ve")') ||
                          await page.$('input[value*="Sin"]') ||
                          await page.$('[id*="sinClave"]') ||
                          await page.$('a:has-text("Acceso sin cl@ve")');
      
      if (sinClaveBtn) {
        await sinClaveBtn.click();
      } else {
        // Try finding any button/link that doesn't mention clave
        const allLinks = await page.$$('a, button, input[type="button"]');
        for (const link of allLinks) {
          const txt = await link.evaluate(el => el.textContent || el.value || '');
          if (/sin cl/i.test(txt) || /without/i.test(txt)) {
            await link.click();
            break;
          }
        }
      }
      await page.waitForTimeout(2000);
    } catch (e) {
      console.log(`  ⚠️  Sin Clave click error: ${e.message}`);
    }

    // Step 6: Fill in personal details
    try {
      await page.waitForSelector('input', { timeout: 10000 });

      // Fill NIE
      const nieField = await page.$('input[id*="nie" i]') ||
                       await page.$('input[name*="nie" i]') ||
                       await page.$('input[id*="nif" i]') ||
                       await page.$('input[placeholder*="NIE" i]');
      if (nieField) {
        await nieField.fill(CONFIG.nie);
      } else {
        // Fill first text input
        const inputs = await page.$$('input[type="text"]');
        if (inputs[0]) await inputs[0].fill(CONFIG.nie);
      }

      await page.waitForTimeout(500);

      // Fill name
      const nameField = await page.$('input[id*="nombre" i]') ||
                        await page.$('input[name*="nombre" i]') ||
                        await page.$('input[placeholder*="nombre" i]');
      if (nameField) {
        await nameField.fill(CONFIG.name);
      } else {
        const inputs = await page.$$('input[type="text"]');
        if (inputs[1]) await inputs[1].fill(CONFIG.name);
      }

      await page.waitForTimeout(500);

      // Select nationality
      const nationalitySelect = await page.$('select[id*="pais" i]') ||
                                 await page.$('select[id*="nacional" i]') ||
                                 await page.$('select[name*="pais" i]');
      if (nationalitySelect) {
        await nationalitySelect.selectOption({ label: /pakistan/i });
      }

    } catch (e) {
      console.log(`  ⚠️  Form fill error: ${e.message}`);
      return false;
    }

    await clickAceptar(page);
    await page.waitForTimeout(2000);

    // Step 7: Click "Solicitar Cita" (Search for appointment)
    try {
      const citaBtn = await page.$('input[value*="Cita" i]') ||
                      await page.$('button:has-text("Cita")') ||
                      await page.$('a:has-text("Cita")') ||
                      await page.$('[id*="btnSolicitar"]');
      
      if (citaBtn) await citaBtn.click();
      await page.waitForTimeout(3000);
    } catch (e) {
      console.log(`  ⚠️  Solicitar cita error: ${e.message}`);
    }

    // Step 8: Check result
    const pageContent = await page.content();
    const pageText = await page.evaluate(() => document.body.innerText);

    const noAppointment = /no hay cita|no existe|no disponible|no quedan|sin citas/i.test(pageText);
    const hasAppointment = /seleccione.*fecha|elija.*hora|fecha.*disponible|calendar/i.test(pageText) ||
                           await page.$('select[id*="fecha"]') !== null ||
                           await page.$('input[type="date"]') !== null;

    if (hasAppointment && !noAppointment) {
      console.log(`\n🎉🎉 APPOINTMENT FOUND at ${stationName}! 🎉🎉`);
      await sendNotification(stationName, `Appointment available! Go book now at: https://icp.administracionelectronica.gob.es/icpplus/index.html`);
      return true; // FOUND!
    } else {
      console.log(`  ❌ No appointments at ${stationName}`);
      return false;
    }

  } catch (err) {
    console.log(`  ⚠️  Error at ${stationName}: ${err.message}`);
    return false;
  }
}

async function clickAceptar(page) {
  try {
    const btn = await page.$('input[value="Aceptar"]') ||
                await page.$('input[value="ACEPTAR"]') ||
                await page.$('button:has-text("Aceptar")') ||
                await page.$('[id*="btnAceptar"]') ||
                await page.$('[id*="Aceptar"]');
    if (btn) {
      await btn.click();
    }
  } catch (e) {}
}

// ============================================================
// MAIN LOOP
// ============================================================
async function runBot() {
  console.log('🤖 Bot started!');
  console.log(`📋 Name: ${CONFIG.name}`);
  console.log(`🪪  NIE: ${CONFIG.nie}`);
  console.log(`🌍 Nationality: ${CONFIG.nationality}`);
  console.log(`📧 Notifications: ${CONFIG.email}`);
  console.log('=====================================\n');

  let cycleCount = 0;

  while (true) {
    cycleCount++;
    console.log(`\n🔄 === CYCLE ${cycleCount} started at ${new Date().toLocaleString()} ===`);

    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });

    const page = await context.newPage();
    let found = false;

    for (const station of BARCELONA_STATIONS) {
      found = await checkStation(page, station);
      
      if (found) {
        console.log('\n✅ BOT STOPPING — appointment found! Check your email!');
        await browser.close();
        process.exit(0);
      }

      // Wait between stations to avoid being blocked
      await new Promise(r => setTimeout(r, 4000));
    }

    await browser.close();

    console.log(`\n✅ Cycle ${cycleCount} complete. No appointments found.`);
    console.log(`⏳ Waiting ${CONFIG.checkIntervalMinutes} minutes before next cycle...`);
    
    // Wait before next full cycle
    await new Promise(r => setTimeout(r, CONFIG.checkIntervalMinutes * 60 * 1000));
  }
}

// Start the bot
runBot().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
