import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const months = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const pvProfile = [203, 286, 436, 556, 669, 737, 714, 639, 504, 353, 233, 181];
const consoProfile = [480, 450, 410, 350, 300, 270, 260, 280, 330, 390, 450, 490];
const defaultElectricityRate = 0.194;
const defaultExportRate = 0.04;
const defaultBatteryEfficiency = 0.9;

const state = {
  clientName: '',
  address: '',
  date: new Date().toLocaleDateString('fr-FR'),
  reference: '',
  heating: 'Électrique',
  occupants: '4',
  panels: 12,
  panelWc: 500,
  inverter: 'Micro-onduleurs',
  orientation: 'Sud / Ouest',
  tilt: '35',
  installType: 'Surimposition toiture',
  price: 7000,
  electricityRate: defaultElectricityRate,
  exportRate: defaultExportRate,
  batteryCapacity: 10,
  batteryEfficiency: defaultBatteryEfficiency,
  batteryCost: 2000,
  energyMode: 'monthly',
  quickProductionAnnual: pvProfile.reduce((sum, value) => sum + value, 0),
  quickConsumptionAnnual: 4990,
  pvCurve: buildPvCurve(12, 500),
  consoCurve: buildConsumptionCurve(4990),
  importMessage: '',
  photo: '',
  photoMode: 'landscape',
  consultant: 'Daoudi Samy',
  phone: '06 48 04 21 71'
};

function buildPvCurve(panels, panelWc) {
  return buildPvCurveFromAnnual(pvProfile.reduce((sum, value) => sum + value, 0));
}

function distributeAnnualByProfile(annualTarget, profile) {
  const target = Number(annualTarget || 0);
  const profileTotal = profile.reduce((sum, value) => sum + value, 0);
  const monthly = profile.map((value) => Math.round((value / profileTotal) * target));
  const delta = Math.round(target) - monthly.reduce((sum, value) => sum + value, 0);
  monthly[monthly.length - 1] += delta;
  return monthly;
}

function buildPvCurveFromAnnual(production) {
  return distributeAnnualByProfile(production, pvProfile);
}

function buildConsumptionCurve(consumption) {
  return distributeAnnualByProfile(consumption, consoProfile);
}

function hasMonthlyEnergyData() {
  return [state.pvCurve, state.consoCurve].every(
    (curve) => Array.isArray(curve) && curve.length === 12 && curve.some((value) => Number(value || 0) > 0)
  );
}

function activeEnergyMode() {
  return state.energyMode === 'quick' || !hasMonthlyEnergyData() ? 'quick' : 'monthly';
}

function activeProductionCurve() {
  return activeEnergyMode() === 'quick' ? buildPvCurveFromAnnual(state.quickProductionAnnual) : state.pvCurve;
}

function activeConsumptionCurve() {
  return activeEnergyMode() === 'quick' ? buildConsumptionCurve(state.quickConsumptionAnnual) : state.consoCurve;
}

function energyDataCheck() {
  const productionCurve = activeProductionCurve();
  const consumptionCurve = activeConsumptionCurve();
  const productionMonthly = Math.round(productionCurve.reduce((sum, value) => sum + Number(value || 0), 0));
  const consumptionMonthly = Math.round(consumptionCurve.reduce((sum, value) => sum + Number(value || 0), 0));
  const productionAnnual = annualProduction();
  const consumptionAnnual = adjustedConsumption();

  return {
    productionMonthly,
    consumptionMonthly,
    productionAnnual,
    consumptionAnnual,
    productionGap: productionMonthly - productionAnnual,
    consumptionGap: consumptionMonthly - consumptionAnnual,
    valid: productionMonthly === productionAnnual && consumptionMonthly === consumptionAnnual
  };
}

function formatNumber(value) {
  const number = Number(value) || 0;
  return new Intl.NumberFormat('fr-FR').format(Math.round(number));
}

function formatDecimal(value, digits = 1) {
  return new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0
  }).format(Number(value || 0));
}

function kwc() {
  return ((Number(state.panels || 0) * Number(state.panelWc || 0)) / 1000).toFixed(1).replace('.', ',');
}

function annualProduction() {
  return Math.round(activeProductionCurve().reduce((sum, value) => sum + Number(value || 0), 0));
}

function adjustedConsumption() {
  return Math.round(activeConsumptionCurve().reduce((sum, value) => sum + Number(value || 0), 0));
}

function netCost() {
  return Math.max(0, Number(state.price || 0));
}

function hourlyConsumptionWeight(hour, profile) {
  const standard = [0.55, 0.48, 0.45, 0.43, 0.45, 0.58, 0.85, 1.05, 0.95, 0.78, 0.68, 0.62, 0.65, 0.68, 0.72, 0.82, 1.05, 1.35, 1.55, 1.45, 1.18, 0.95, 0.78, 0.65];
  return standard[hour];
}

function hourlyProductionWeight(hour, monthIndex) {
  const daylightByMonth = [8.6, 10, 11.9, 13.7, 15, 15.8, 15.4, 14.1, 12.5, 10.7, 9, 8.3];
  const solarNoon = 13;
  const daylight = daylightByMonth[monthIndex];
  const sunrise = solarNoon - daylight / 2;
  const sunset = solarNoon + daylight / 2;
  const midHour = hour + 0.5;
  if (midHour <= sunrise || midHour >= sunset) return 0;
  const progress = (midHour - sunrise) / daylight;
  return Math.sin(Math.PI * progress) ** 1.35;
}

function distributeMonthlyToHours(monthlyValues, weightForHour) {
  return monthlyValues.flatMap((monthlyValue, monthIndex) => {
    const days = monthDays[monthIndex];
    const weights = Array.from({ length: days * 24 }, (_, index) => weightForHour(index % 24, monthIndex));
    const totalWeight = weights.reduce((sum, value) => sum + value, 0) || weights.length;
    return weights.map((weight) => (Number(monthlyValue || 0) * weight) / totalWeight);
  });
}

function hourlySeries() {
  const production = distributeMonthlyToHours(activeProductionCurve(), hourlyProductionWeight);
  const baseConsumption = distributeMonthlyToHours(activeConsumptionCurve(), (hour) => hourlyConsumptionWeight(hour));

  return {
    production,
    consumption: baseConsumption
  };
}

function summarizeEnergy(values) {
  return Math.round(values.reduce((sum, value) => sum + value, 0));
}

function buildScenario(values, options = {}) {
  const batteryCapacity = Number(options.batteryCapacity || 0);
  const batteryEfficiency = Math.max(0, Math.min(1, Number(state.batteryEfficiency || defaultBatteryEfficiency)));
  const hasBattery = batteryCapacity > 0;
  let batterySoc = 0;
  let selfConsumed = 0;
  let surplus = 0;
  let gridPurchase = 0;
  let batteryCharged = 0;
  let batteryDischarged = 0;

  values.production.forEach((productionValue, index) => {
    const production = Math.max(0, productionValue);
    const consumption = Math.max(0, values.consumption[index] || 0);
    const instantSelfUse = Math.min(production, consumption);
    let remainingProduction = production - instantSelfUse;
    let remainingConsumption = consumption - instantSelfUse;
    selfConsumed += instantSelfUse;

    if (hasBattery && remainingProduction > 0) {
      const storageRoom = Math.max(0, batteryCapacity - batterySoc);
      const energySentToBattery = Math.min(remainingProduction, storageRoom / batteryEfficiency);
      const storedEnergy = energySentToBattery * batteryEfficiency;
      batterySoc += storedEnergy;
      batteryCharged += storedEnergy;
      remainingProduction -= energySentToBattery;
    }

    if (hasBattery && remainingConsumption > 0) {
      const discharged = Math.min(remainingConsumption, batterySoc);
      batterySoc -= discharged;
      batteryDischarged += discharged;
      selfConsumed += discharged;
      remainingConsumption -= discharged;
    }

    surplus += Math.max(0, remainingProduction);
    gridPurchase += Math.max(0, remainingConsumption);
  });

  const production = summarizeEnergy(values.production);
  const consumption = summarizeEnergy(values.consumption);
  const roundedSelfConsumed = Math.round(selfConsumed);
  const roundedSurplus = Math.round(surplus);
  const roundedGridPurchase = Math.round(gridPurchase);
  const roundedSystemLosses = Math.max(0, production - roundedSelfConsumed - roundedSurplus);
  const electricityRate = Number(state.electricityRate || 0);
  const billBefore = consumption * electricityRate;
  const billReduction = Math.round(roundedSelfConsumed * electricityRate);
  const resale = Math.round(roundedSurplus * Number(state.exportRate || 0));

  return {
    production,
    consumption,
    selfConsumed: roundedSelfConsumed,
    surplus: roundedSurplus,
    systemLosses: roundedSystemLosses,
    gridPurchase: roundedGridPurchase,
    selfUsePercent: production ? Math.round((roundedSelfConsumed / production) * 100) : 0,
    surplusPercent: production ? Math.round((roundedSurplus / production) * 100) : 0,
    systemLossPercent: production ? Math.max(0, 100 - Math.round((roundedSelfConsumed / production) * 100) - Math.round((roundedSurplus / production) * 100)) : 0,
    coverage: consumption ? Math.round((roundedSelfConsumed / consumption) * 100) : 0,
    billReductionPercent: billBefore ? Math.round(((roundedSelfConsumed * electricityRate) / billBefore) * 100) : 0,
    billReduction,
    resale,
    totalGain: billReduction + resale,
    batteryCharged: Math.round(batteryCharged),
    batteryDischarged: Math.round(batteryDischarged)
  };
}

function simulation() {
  const values = hourlySeries();
  const batteryCapacity = Number(state.batteryCapacity || 0);
  const batteryCost = Number(state.batteryCost || 0);
  const withoutBattery = buildScenario(values);
  const withBattery = buildScenario(values, { batteryCapacity });
  withoutBattery.projectCost = Number(state.price || 0);
  withBattery.projectCost = Number(state.price || 0) + (batteryCapacity > 0 ? batteryCost : 0);

  return {
    withoutBattery,
    withBattery,
    projectScenario: batteryCapacity > 0 ? withBattery : withoutBattery,
    hasBatteryProject: batteryCapacity > 0,
    difference: {
      annualGain: withBattery.totalGain - withoutBattery.totalGain,
      billReduction: withBattery.billReduction - withoutBattery.billReduction,
      resale: withBattery.resale - withoutBattery.resale,
      gridPurchase: withoutBattery.gridPurchase - withBattery.gridPurchase,
      batteryExtraCost: withBattery.projectCost - withoutBattery.projectCost
    }
  };
}

function totalGain() {
  return simulation().withoutBattery.totalGain;
}

function roiYears(gain = totalGain(), cost = netCost()) {
  return gain ? Math.max(1, Math.round((cost / gain) * 10) / 10).toString().replace('.', ',') : '...';
}

function input(label, key, type = 'text', attrs = '') {
  return `
    <label class="field">
      <span>${label}</span>
      <input name="${key}" type="${type}" value="${state[key]}" ${attrs} />
    </label>
  `;
}

function select(label, key, options) {
  return `
    <label class="field">
      <span>${label}</span>
      <select name="${key}">
        ${Object.entries(options)
          .map(([value, labelText]) => `<option value="${value}" ${state[key] === value ? 'selected' : ''}>${labelText}</option>`)
          .join('')}
      </select>
    </label>
  `;
}

function importControl(label, key, accept) {
  return `
    <label class="field import-field">
      <span>${label}</span>
      <input type="file" data-import="${key}" accept="${accept}" />
    </label>
  `;
}

function normalizeText(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function numericValue(value) {
  return Number(String(value).replace(/\s/g, '').replace(',', '.')) || 0;
}

function extractMonthlyValues(text) {
  const normalized = normalizeText(text);
  const monthPatterns = [
    'janvier|janv\\.?|january|jan\\.?',
    'fevrier|fevr\\.?|february|feb\\.?',
    'mars|march|mar\\.?',
    'avril|avr\\.?|april|apr\\.?',
    'mai|may',
    'juin|june|jun\\.?',
    'juillet|july|jul\\.?',
    'aout|august|aug\\.?',
    'septembre|sept\\.?|september|sep\\.?',
    'octobre|oct\\.?|october',
    'novembre|nov\\.?|november',
    'decembre|dec\\.?|december'
  ];
  const fromLabels = monthPatterns.map((pattern) => {
    const match = normalized.match(new RegExp(`(?:${pattern})[^0-9]{0,40}([0-9][0-9\\s.,]*)`, 'i'));
    return match ? Math.round(numericValue(match[1])) : null;
  });
  if (fromLabels.every((value) => value !== null && Number(value) >= 0)) return fromLabels;

  const numbers = normalized
    .match(/[0-9]+(?:[\s.,][0-9]+)?/g)
    ?.map(numericValue)
    .filter((value) => value > 0 && value < 20000);

  if (!numbers || numbers.length < 12) return null;
  return numbers.slice(0, 12).map((value) => Math.round(value));
}

function detectAnnualValue(text, monthlyValues) {
  const normalized = normalizeText(text);
  const labeledAnnual = normalized.match(/(?:annuel|annual|total)[^0-9]{0,50}([0-9][0-9\s.,]*)/i);
  if (labeledAnnual) return Math.round(numericValue(labeledAnnual[1]));
  return monthlyValues.reduce((sum, value) => sum + Number(value || 0), 0);
}

async function extractPdfText(file) {
  const pdfjs = await import(/* @vite-ignore */ 'https://esm.sh/pdfjs-dist@4.10.38/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
  const data = new Uint8Array(await file.arrayBuffer());
  const documentTask = pdfjs.getDocument({ data });
  const pdf = await documentTask.promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(' '));
  }

  return pages.join('\n');
}

async function extractSpreadsheetText(file) {
  const XLSX = await import(/* @vite-ignore */ 'https://esm.sh/xlsx@0.18.5');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  return workbook.SheetNames.map((sheetName) => XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName])).join('\n');
}

async function extractImageText(file) {
  const Tesseract = await import(/* @vite-ignore */ 'https://esm.sh/tesseract.js@5.1.1');
  const result = await Tesseract.recognize(file, 'fra+eng');
  return result.data.text;
}

async function extractFileText(file) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (file.type === 'application/pdf' || extension === 'pdf') return extractPdfText(file);
  if (['xlsx', 'xls'].includes(extension)) return extractSpreadsheetText(file);
  if (file.type.startsWith('image/') || ['jpg', 'jpeg', 'png'].includes(extension)) return extractImageText(file);
  return file.text();
}

async function importMonthlyFile(file, key) {
  try {
    state.importMessage = 'Lecture du fichier en cours...';
    renderPreview();
    const text = await extractFileText(file);
    const monthlyValues = extractMonthlyValues(text);
    if (!monthlyValues) {
      throw new Error('Extraction impossible, veuillez vérifier le fichier ou saisir les données manuellement.');
    }

    state[key] = monthlyValues;
    state.energyMode = 'monthly';
    state.importMessage = `${key === 'pvCurve' ? 'Production PVGIS' : 'Consommation'} importée : ${formatNumber(detectAnnualValue(text, monthlyValues))} kWh/an.`;
    render();
  } catch (error) {
    state.importMessage = error.message || 'Extraction impossible, veuillez vérifier le fichier ou saisir les données manuellement.';
    render();
  }
}

function sectionNumber(number, title) {
  return `<div class="section-title"><span>${number}</span><strong>${title}</strong></div>`;
}

function textValue(value, fallback = '...') {
  return value || fallback;
}

function money(value) {
  return `${formatNumber(value)} €`;
}

function renderChart() {
  const pvCurve = activeProductionCurve();
  const consoCurve = activeConsumptionCurve();
  const maxValue = Math.max(...pvCurve, ...consoCurve, 100);
  const max = Math.ceil(maxValue / 100) * 100;
  const axis = [max, max * 0.8, max * 0.6, max * 0.4, max * 0.2, 0];
  const width = 620;
  const height = 210;
  const pad = { left: 28, right: 12, top: 10, bottom: 22 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const point = (value, index) => {
    const x = pad.left + (plotWidth / 11) * index;
    const y = pad.top + plotHeight - (Number(value || 0) / max) * plotHeight;
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  };
  const pvPoints = pvCurve.map(point);
  const consoPoints = consoCurve.map(point);
  const path = (points) => points.map(([x, y], index) => `${index ? 'L' : 'M'} ${x} ${y}`).join(' ');
  const areaPath = `M ${consoPoints[0][0]} ${pad.top + plotHeight} L ${consoPoints
    .map(([x, y]) => `${x} ${y}`)
    .join(' L ')} L ${consoPoints[11][0]} ${pad.top + plotHeight} Z`;
  const grid = axis
    .map((value) => {
      const y = pad.top + plotHeight - (value / max) * plotHeight;
      return `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" />`;
    })
    .join('');
  const xLabels = months
    .map((month, index) => {
      const [x] = point(0, index);
      return `<text x="${x}" y="${height - 4}">${month}</text>`;
    })
    .join('');
  const yLabels = axis
    .map((value) => {
      const y = pad.top + plotHeight - (value / max) * plotHeight;
      return `<text x="${pad.left - 8}" y="${y + 3}">${formatNumber(value)}</text>`;
    })
    .join('');
  const dots = pvPoints.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" />`).join('');

  return `
    <div class="legend"><span><i class="pv-dot"></i>Production PV</span><span><i class="use-dot"></i>Consommation</span></div>
    <svg class="line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Courbes mensuelles">
      <g class="chart-grid-lines">${grid}</g>
      <g class="chart-y-labels">${yLabels}</g>
      <g class="chart-x-labels">${xLabels}</g>
      <path class="conso-area" d="${areaPath}" />
      <path class="conso-line" d="${path(consoPoints)}" />
      <path class="pv-line" d="${path(pvPoints)}" />
      <g class="pv-points">${dots}</g>
    </svg>
  `;
}

function curveInputs(label, key) {
  return `
    <div class="curve-editor">
      <h4>${label}</h4>
      <div class="curve-grid">
        ${monthNames
          .map(
            (month, index) => `
              <label class="field mini-field">
                <span>${month}</span>
                <input name="${key}:${index}" type="number" min="0" value="${state[key][index]}" />
              </label>
            `
          )
          .join('')}
      </div>
    </div>
  `;
}

function renderDonut(scenario = simulation().projectScenario) {
  const selfUse = scenario.selfUsePercent;
  const sold = scenario.surplusPercent;
  const losses = scenario.systemLossPercent;
  return `
    <canvas class="donut" width="140" height="140" data-self="${selfUse}" aria-label="Répartition de la production"></canvas>
    <p class="self-used"><strong>Production solaire autoconsommée</strong> ${selfUse}% <small>${formatNumber(scenario.selfConsumed)} kWh</small></p>
    <p class="exported-surplus"><strong>Énergie réinjectée sur le réseau</strong> ${sold}% <small>${formatNumber(scenario.surplus)} kWh</small></p>
    ${
      losses > 0
        ? `<p class="system-losses"><strong>Pertes système éventuelles</strong> ${losses}% <small>${formatNumber(scenario.systemLosses)} kWh</small></p>`
        : ''
    }
  `;
}

function verificationTable() {
  return `
    <div class="verification-table">
      <h4>Tableau de vérification avant génération PDF</h4>
      <div class="verification-head"><span>Mois</span><span>Production</span><span>Consommation</span></div>
      ${monthNames
        .map(
          (month, index) => `
            <div class="verification-row">
              <span>${month}</span>
              <input name="pvCurve:${index}" type="number" min="0" value="${state.pvCurve[index]}" />
              <input name="consoCurve:${index}" type="number" min="0" value="${state.consoCurve[index]}" />
            </div>
          `
        )
        .join('')}
    </div>
  `;
}

function quickEntryPanel() {
  return `
    <div class="quick-entry-panel">
      <div class="form-grid">
        ${input('Production annuelle (kWh/an)', 'quickProductionAnnual', 'number', 'min="0"')}
        ${input('Consommation annuelle (kWh/an)', 'quickConsumptionAnnual', 'number', 'min="0"')}
      </div>
      <p>Le logiciel génère automatiquement une répartition mensuelle estimée et normalisée avec un profil standard résidentiel.</p>
    </div>
  `;
}

function energyDataTabs() {
  const currentMode = activeEnergyMode();
  const check = energyDataCheck();
  return `
    <div class="energy-tabs" role="tablist" aria-label="Mode de saisie des données énergétiques">
      <button type="button" class="${currentMode === 'monthly' ? 'active' : ''}" data-energy-mode="monthly">Vérification des données mensuelles</button>
      <button type="button" class="${currentMode === 'quick' ? 'active' : ''}" data-energy-mode="quick">Saisie rapide</button>
    </div>
    ${
      check.valid
        ? ''
        : `<p class="energy-alert">Écart détecté : la somme mensuelle ne correspond pas aux totaux annuels. Vérifiez les valeurs ou relancez la répartition estimée.</p>`
    }
    ${currentMode === 'quick' ? quickEntryPanel() : verificationTable()}
  `;
}

function drawDonuts() {
  document.querySelectorAll('.donut').forEach((canvas) => {
    const ctx = canvas.getContext('2d');
    const selfUse = Number(canvas.dataset.self || 0);
    const center = 70;
    const radius = 44;
    const lineWidth = 28;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#f5a20a';
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#29b263';
    ctx.beginPath();
    ctx.arc(center, center, radius, -Math.PI / 2, -Math.PI / 2 + (selfUse / 100) * Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(center, center, 27, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0d2e4b';
    ctx.textAlign = 'center';
    ctx.font = '700 10px Arial';
    ctx.fillText('Production', center, 66);
    ctx.font = '900 18px Arial';
    ctx.fillText('100%', center, 86);
  });
}

function renderReport() {
  const result = simulation();
  const withoutBattery = result.withoutBattery;
  const withBattery = result.withBattery;
  const projectScenario = result.projectScenario;
  const production = projectScenario.production;
  const consumption = projectScenario.consumption;
  const coverage = projectScenario.coverage;
  const projectCost = projectScenario.projectCost;
  const solarProjectCost = withoutBattery.projectCost;
  const batteryProjectCost = withBattery.projectCost;
  return `
    <article id="report" class="report" aria-label="Étude photovoltaïque">
      <header class="report-header">
        <span class="sun-mark" aria-hidden="true"></span>
        <div>
          <h1>ÉTUDE PHOTOVOLTAÏQUE</h1>
          <p>Votre projet sur mesure — Synthèse en une page</p>
        </div>
        <div class="client-card">
          <strong>CLIENT</strong>
          <span>Nom : ${textValue(state.clientName)}</span>
          <span>Adresse : ${textValue(state.address)}</span>
        </div>
        <div class="meta-card">
          <span>Réf : ${textValue(state.reference)}</span>
          <span>Date : ${textValue(state.date)}</span>
        </div>
      </header>

      <section class="top-grid">
        <div class="panel photo-panel">
          ${sectionNumber(1, 'PHOTO DE LA MAISON + SIMULATION')}
          <div class="photo-box ${state.photo ? 'has-photo' : ''}">
            ${
              state.photo
                ? `<div class="uploaded-photo ${state.photoMode}"><img class="photo-bg" src="${state.photo}" alt="" /><img class="photo-main" src="${state.photo}" alt="Maison du client" /></div>`
                : `<div class="house-scene" aria-hidden="true">
                    <i class="scene-sun"></i>
                    <i class="roof"></i>
                    <i class="walls"></i>
                    <i class="panels"></i>
                    <i class="door"></i>
                    <i class="window left"></i>
                    <i class="window right"></i>
                    <span>PHOTO CLIENT À INSÉRER</span>
                  </div>`
            }
          </div>
        </div>

        <div class="panel home-panel">
          ${sectionNumber(2, 'LE FOYER')}
          <dl class="facts">
            <div><dt>Conso/an :</dt><dd class="important-consumption">${formatNumber(consumption)} kWh</dd></div>
            <div><dt>Chauffage :</dt><dd>${textValue(state.heating)}</dd></div>
            <div><dt>Occupants :</dt><dd>${textValue(state.occupants)}</dd></div>
          </dl>
          <h3>PROFIL :</h3>
          <ul>
            <li class="active">✔ Standard résidentiel</li>
          </ul>
        </div>

        <div class="panel install-panel">
          ${sectionNumber(3, "L'INSTALLATION PROPOSÉE")}
          <div class="metrics">
            <div><span>NB PANNEAUX</span><strong>${textValue(state.panels)}</strong><small>× ${formatNumber(state.panelWc)} Wc</small></div>
            <div><span>PUISSANCE</span><strong>${kwc()} kWc</strong><small>totale installée</small></div>
            <div><span>ONDULEUR</span><strong>${textValue(state.inverter)}</strong><small>type / marque</small></div>
            <div><span>ORIENTATION</span><strong>${textValue(state.orientation, 'À renseigner')}</strong><small>${textValue(state.tilt)}° d'inclinaison</small></div>
          </div>
          <p>Type de pose : ${textValue(state.installType)}</p>
        </div>
      </section>

      <section class="middle-grid">
        <div class="panel production-panel">
          <div class="title-row">${sectionNumber(4, 'PRODUCTION ANNUELLE')}</div>
          ${renderChart()}
          <div class="annual annual-summary">
            <div class="annual-row production-total"><strong>Production annuelle :</strong><b>${formatNumber(production)} kWh/an</b></div>
            <div class="annual-row consumption-total"><strong>Consommation annuelle :</strong><b>${formatNumber(consumption)} kWh/an</b></div>
          </div>
        </div>

        <div class="panel split-panel">
          ${sectionNumber(5, 'RÉPARTITION')}
          <div class="coverage"><strong>CONSOMMATION DU FOYER COUVERTE PAR LE SOLAIRE</strong><b>${coverage} %</b></div>
          ${renderDonut(projectScenario)}
        </div>
      </section>

      <section class="economy-grid">
        <div class="panel savings-panel">
          ${sectionNumber(6, 'VOS ÉCONOMIES')}
          <div class="annual-gain">
            <span>Gain annuel estimé</span>
            <strong>${money(projectScenario.totalGain)} <em>/ an</em></strong>
            <small>économies sur facture + revente surplus</small>
          </div>
          <div class="bill-drop-summary">
            <span>Facture réduite d’environ</span>
            <strong>${projectScenario.billReductionPercent} %</strong>
          </div>
        </div>

        <div class="panel cost-panel">
          ${sectionNumber(7, 'COÛT & RENTABILITÉ')}
          <div class="project-costs">
            <div class="project-cost"><span>Projet solaire seul</span><strong>${money(solarProjectCost)}</strong></div>
            <div class="project-cost with-battery-cost"><span>Projet avec batterie</span><strong>${money(batteryProjectCost)}</strong></div>
          </div>
          <div class="roi"><span>RETOUR SUR INVESTISSEMENT</span><strong>${roiYears(projectScenario.totalGain, projectCost)} ans</strong><small>Estimation basée sur le gain annuel</small></div>
        </div>

        <div class="panel projection-panel">
          ${sectionNumber(8, 'ÉCONOMIE RÉALISÉE')}
          <div class="projection-table">
            <div class="projection-head"><span></span><strong>Sans batterie</strong><strong>Avec batterie</strong></div>
            ${[10, 15, 20, 25]
              .map(
                (years) => `
                  <div class="projection-row">
                    <span>${years} ans</span>
                    <strong class="without-battery">${money(withoutBattery.totalGain * years)}</strong>
                    <strong class="with-battery">${money(withBattery.totalGain * years)}</strong>
                  </div>
                `
              )
              .join('')}
          </div>
        </div>
      </section>

      <section class="battery-panel">
        <div class="battery-title"><strong>COMPARAISON DU PROJET</strong><em>Solaire seul ou solaire + batterie</em></div>
        <div class="project-comparison-grid">
          <div class="comparison-card without-storage">
            <h3>SOLAIRE SEUL</h3>
            <dl>
              <div><dt>Coût du projet</dt><dd>${money(solarProjectCost)}</dd></div>
              <div class="highlight"><dt>Gain annuel estimé</dt><dd>${money(withoutBattery.totalGain)} <small>/ an</small></dd></div>
              <div><dt>Facture réduite d’environ</dt><dd>${withoutBattery.billReductionPercent} %</dd></div>
              <div><dt>Consommation couverte par le solaire</dt><dd>${withoutBattery.coverage} %</dd></div>
              <div><dt>Retour estimé</dt><dd>${roiYears(withoutBattery.totalGain, solarProjectCost)} ans</dd></div>
            </dl>
          </div>
          <div class="comparison-card with-storage">
            <h3>SOLAIRE + BATTERIE</h3>
            <dl>
              <div><dt>Coût du projet</dt><dd>${money(batteryProjectCost)}</dd></div>
              <div class="highlight"><dt>Gain annuel estimé</dt><dd>${money(withBattery.totalGain)} <small>/ an</small></dd></div>
              <div><dt>Facture réduite d’environ</dt><dd>${withBattery.billReductionPercent} %</dd></div>
              <div><dt>Consommation couverte par le solaire</dt><dd>${withBattery.coverage} %</dd></div>
              <div><dt>Retour estimé</dt><dd>${roiYears(withBattery.totalGain, batteryProjectCost)} ans</dd></div>
            </dl>
          </div>
        </div>
      </section>

      <footer class="report-footer">
        <span>Document non contractuel — HABITONTOIT 3 rue du Champenatre 25770 Serre-Les-Sapins</span>
        <div class="footer-contact">
          <strong>${state.consultant}, gérant de l'entreprise HABITONTOIT</strong>
          <span>${state.phone}</span>
        </div>
      </footer>
    </article>
  `;
}

function renderControls() {
  return `
    <aside class="controls">
      <div class="controls-head">
        <div>
          <h2>Générateur PDF solaire</h2>
          <p>Remplissez les données, vérifiez l'aperçu A4, puis exportez la synthèse.</p>
        </div>
        <button id="downloadPdf" class="primary" type="button">Générer le PDF</button>
      </div>

      <details open>
        <summary>Client</summary>
        <div class="form-grid">
          ${input('Nom client', 'clientName')}
          ${input('Adresse', 'address')}
          ${input('Date', 'date')}
          ${input('Référence', 'reference')}
        </div>
      </details>

      <details open>
        <summary>Foyer</summary>
        <div class="form-grid">
          ${input('Chauffage', 'heating')}
          ${input('Occupants', 'occupants', 'number', 'min="1"')}
        </div>
      </details>

      <details open>
        <summary>Installation</summary>
        <div class="form-grid">
          ${input('Nombre de panneaux', 'panels', 'number', 'min="1"')}
          ${input('Puissance panneau (Wc)', 'panelWc', 'number', 'min="1"')}
          ${input('Onduleur', 'inverter')}
          ${input('Orientation', 'orientation')}
          ${input('Inclinaison (degrés)', 'tilt', 'number')}
          ${input('Type de pose', 'installType')}
        </div>
        <label class="field file-field">
          <span>Photo maison</span>
          <input id="photoInput" type="file" accept="image/*" />
        </label>
      </details>

      <details open>
        <summary>Économies</summary>
        <div class="form-grid">
          ${input('Prix TTC (€)', 'price', 'number', 'min="0"')}
          ${input('Prix kWh acheté (€)', 'electricityRate', 'number', 'min="0" step="0.001"')}
          ${input('Tarif revente surplus (€)', 'exportRate', 'number', 'min="0" step="0.001"')}
          ${input('Capacité batterie (kWh)', 'batteryCapacity', 'number', 'min="0" step="0.1"')}
          ${input('Surcoût batterie (€)', 'batteryCost', 'number', 'min="0"')}
        </div>
      </details>

      <details open>
        <summary>Import automatique des données</summary>
        <div class="form-grid">
          ${importControl('Importer production PVGIS', 'pvCurve', '.pdf,.csv,.txt,.xlsx,.xls,.jpg,.jpeg,.png,image/*')}
          ${importControl('Importer consommation client', 'consoCurve', '.pdf,.csv,.txt,.xlsx,.xls,.jpg,.jpeg,.png,image/*')}
        </div>
        ${state.importMessage ? `<p class="import-message">${state.importMessage}</p>` : ''}
      </details>

      <details open>
        <summary>Données énergétiques</summary>
        ${energyDataTabs()}
      </details>

      <details>
        <summary>Contact</summary>
        <div class="form-grid">
          ${input('Nom commercial', 'consultant')}
          ${input('Téléphone', 'phone')}
        </div>
      </details>
    </aside>
  `;
}

function render() {
  document.querySelector('#app').innerHTML = `
    <main class="app-shell">
      ${renderControls()}
      <section class="preview-wrap">
        <div class="preview-toolbar">
          <span>Aperçu responsive · format A4 portrait</span>
        </div>
        <div class="preview-scale" id="previewScale">${renderReport()}</div>
      </section>
    </main>
  `;
  bindEvents();
  applyPreviewScale();
  drawDonuts();
}

function renderPreview() {
  document.querySelector('#previewScale').innerHTML = renderReport();
  applyPreviewScale();
  drawDonuts();
}

function applyPreviewScale() {
  const preview = document.querySelector('#previewScale');
  const wrap = document.querySelector('.preview-wrap');
  if (!preview || !wrap) return;
  const styles = getComputedStyle(wrap);
  const horizontalPadding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const availableWidth = Math.max(280, Math.min(wrap.clientWidth - horizontalPadding, viewportWidth - 32));
  const mobileBuffer = viewportWidth < 720 ? 0.78 : 1;
  const scale = Math.min(1, (availableWidth / 794) * mobileBuffer);
  preview.style.setProperty('--preview-scale', scale.toFixed(4));
}

function bindEvents() {
  document.querySelectorAll('input[name], select[name]').forEach((field) => {
    if (field.name.includes(':')) {
      field.addEventListener('input', (event) => {
        const [key, index] = event.target.name.split(':');
        state.energyMode = 'monthly';
        state[key][Number(index)] = Number(event.target.value) || 0;
        renderPreview();
      });
      return;
    }

    field.addEventListener(field.tagName === 'SELECT' ? 'change' : 'input', (event) => {
      state[event.target.name] = event.target.value;
      if (event.target.name.startsWith('quick')) state.energyMode = 'quick';
      renderPreview();
    });
  });

  document.querySelectorAll('[data-energy-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.energyMode = button.dataset.energyMode;
      render();
    });
  });

  document.querySelectorAll('input[data-import]').forEach((field) => {
    field.addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      importMonthlyFile(file, event.target.dataset.import);
    });
  });

  document.querySelector('#photoInput')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const image = new Image();
      image.addEventListener('load', () => {
        state.photo = reader.result;
        state.photoMode = image.naturalHeight > image.naturalWidth ? 'portrait' : 'landscape';
        renderPreview();
      });
      image.src = reader.result;
    });
    reader.readAsDataURL(file);
  });

  document.querySelector('#downloadPdf').addEventListener('click', downloadPdf);
}

async function downloadPdf() {
  const button = document.querySelector('#downloadPdf');
  const report = document.querySelector('#report');
  button.disabled = true;
  button.textContent = 'Préparation...';
  report.classList.add('exporting');

  try {
    drawDonuts();
    await waitForImages(report);
    const canvas = await html2canvas(report, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false
    });
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const image = canvas.toDataURL('image/png');
    pdf.addImage(image, 'PNG', 0, 0, 595.28, 841.89);
    const name = state.clientName ? state.clientName.toLowerCase().replace(/[^a-z0-9]+/gi, '-') : 'etude-photovoltaique';
    pdf.save(`${name}.pdf`);
  } finally {
    report.classList.remove('exporting');
    button.disabled = false;
    button.textContent = 'Générer le PDF';
  }
}

function waitForImages(root) {
  const pending = [...root.querySelectorAll('img')].filter((image) => !image.complete);
  return Promise.all(
    pending.map(
      (image) =>
        new Promise((resolve) => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', resolve, { once: true });
        })
    )
  );
}

render();
window.addEventListener('resize', applyPreviewScale);
