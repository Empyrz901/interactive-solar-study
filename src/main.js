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
const loadProfiles = {
  standard: 'Standard résidentiel',
  ev: 'Avec voiture électrique'
};

const state = {
  clientName: '',
  address: '',
  date: new Date().toLocaleDateString('fr-FR'),
  reference: '',
  heating: 'Électrique',
  occupants: '4',
  loadProfile: 'standard',
  panels: 12,
  panelWc: 500,
  inverter: 'Micro-onduleurs',
  orientation: 'PVGIS libre',
  tilt: '35',
  installType: 'Surimposition toiture',
  price: 12900,
  grants: 0,
  electricityRate: defaultElectricityRate,
  exportRate: defaultExportRate,
  batteryCapacity: 10,
  batteryEfficiency: defaultBatteryEfficiency,
  batteryCost: 6900,
  pvCurve: buildPvCurve(12, 500),
  consoCurve: buildConsumptionCurve(4490),
  photo: '',
  photoMode: 'landscape',
  consultant: 'VOTRE EXPERT PHOTOVOLTAÏQUE',
  phone: '0648042171',
  email: 'habitontoit@gmail.com'
};

function buildPvCurve(panels, panelWc) {
  return [...pvProfile];
}

function buildConsumptionCurve(consumption) {
  const annualTarget = Number(consumption || 0);
  const profileTotal = consoProfile.reduce((sum, value) => sum + value, 0);
  const monthly = consoProfile.map((value) => Math.round((value / profileTotal) * annualTarget));
  const delta = Math.round(annualTarget) - monthly.reduce((sum, value) => sum + value, 0);
  monthly[monthly.length - 1] += delta;
  return monthly;
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
  return state.pvCurve.reduce((sum, value) => sum + Number(value || 0), 0);
}

function adjustedConsumption() {
  return state.consoCurve.reduce((sum, value) => sum + Number(value || 0), 0);
}

function netCost() {
  return Math.max(0, Number(state.price || 0) - Number(state.grants || 0));
}

function hourlyConsumptionWeight(hour, profile) {
  const standard = [0.55, 0.48, 0.45, 0.43, 0.45, 0.58, 0.85, 1.05, 0.95, 0.78, 0.68, 0.62, 0.65, 0.68, 0.72, 0.82, 1.05, 1.35, 1.55, 1.45, 1.18, 0.95, 0.78, 0.65];
  const evBoost = [1.15, 1.1, 1.0, 0.85, 0.7, 0.55, 0.45, 0.35, 0.25, 0.2, 0.2, 0.2, 0.2, 0.25, 0.3, 0.45, 0.7, 1.05, 1.35, 1.55, 1.65, 1.6, 1.45, 1.3];
  return profile === 'ev' ? standard[hour] * 0.78 + evBoost[hour] * 0.7 : standard[hour];
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
  return {
    production: distributeMonthlyToHours(state.pvCurve, hourlyProductionWeight),
    consumption: distributeMonthlyToHours(state.consoCurve, (hour) => hourlyConsumptionWeight(hour, state.loadProfile))
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
  const billReduction = Math.round(roundedSelfConsumed * Number(state.electricityRate || 0));
  const resale = Math.round(roundedSurplus * Number(state.exportRate || 0));

  return {
    production,
    consumption,
    selfConsumed: roundedSelfConsumed,
    surplus: roundedSurplus,
    gridPurchase: roundedGridPurchase,
    selfUsePercent: production ? Math.round((roundedSelfConsumed / production) * 100) : 0,
    surplusPercent: production ? Math.round((roundedSurplus / production) * 100) : 0,
    coverage: consumption ? Math.round((roundedSelfConsumed / consumption) * 100) : 0,
    billReduction,
    resale,
    totalGain: billReduction + resale,
    batteryCharged: Math.round(batteryCharged),
    batteryDischarged: Math.round(batteryDischarged)
  };
}

function simulation() {
  const values = hourlySeries();
  const withoutBattery = buildScenario(values);
  const withBattery = buildScenario(values, { batteryCapacity: Number(state.batteryCapacity || 0) });
  return {
    withoutBattery,
    withBattery,
    difference: {
      annualGain: withBattery.totalGain - withoutBattery.totalGain,
      billReduction: withBattery.billReduction - withoutBattery.billReduction,
      resale: withBattery.resale - withoutBattery.resale,
      gridPurchase: withoutBattery.gridPurchase - withBattery.gridPurchase
    }
  };
}

function totalGain() {
  return simulation().withoutBattery.totalGain;
}

function roiYears(gain = totalGain(), cost = netCost()) {
  return gain ? Math.max(1, Math.round((cost / gain) * 10) / 10).toString().replace('.', ',') : '...';
}

function batteryRoi() {
  const gain = simulation().difference.annualGain;
  return gain ? Math.max(1, Math.round((Number(state.batteryCost || 0) / gain) * 10) / 10).toString().replace('.', ',') : '...';
}

function batteryNetDifference(years = 20) {
  return simulation().difference.annualGain * years - Number(state.batteryCost || 0);
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
  const maxValue = Math.max(...state.pvCurve, ...state.consoCurve, 100);
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
  const pvPoints = state.pvCurve.map(point);
  const consoPoints = state.consoCurve.map(point);
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

function renderDonut() {
  const scenario = simulation().withoutBattery;
  const selfUse = scenario.selfUsePercent;
  const sold = scenario.surplusPercent;
  return `
    <canvas class="donut" width="140" height="140" data-self="${selfUse}" aria-label="Répartition de la production"></canvas>
    <p class="self-used"><strong>Autoconsommé</strong> ${selfUse}% <small>${formatNumber(scenario.selfConsumed)} kWh</small></p>
    <p class="exported-surplus"><strong>Surplus injecté</strong> ${sold}% <small>${formatNumber(scenario.surplus)} kWh</small></p>
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
  const difference = result.difference;
  const production = withoutBattery.production;
  const coverage = withoutBattery.coverage;
  const saving = withoutBattery.billReduction;
  const resale = withoutBattery.resale;
  const batteryGain = difference.annualGain;
  const batteryEconomy = withBattery.totalGain;
  const batterySelfUsePercent = withBattery.selfUsePercent;
  const netBattery20Years = batteryNetDifference(20);
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
            <div><dt>Conso/an :</dt><dd>${formatNumber(adjustedConsumption())} kWh</dd></div>
            <div><dt>Chauffage :</dt><dd>${textValue(state.heating)}</dd></div>
            <div><dt>Occupants :</dt><dd>${textValue(state.occupants)}</dd></div>
          </dl>
          <h3>PROFIL :</h3>
          <ul>${Object.entries(loadProfiles).map(([key, label]) => `<li class="${state.loadProfile === key ? 'active' : ''}">${label}</li>`).join('')}</ul>
        </div>

        <div class="panel install-panel">
          ${sectionNumber(3, "L'INSTALLATION PROPOSÉE")}
          <div class="metrics">
            <div><span>NB PANNEAUX</span><strong>${textValue(state.panels)}</strong><small>× ${formatNumber(state.panelWc)} Wc</small></div>
            <div><span>PUISSANCE</span><strong>${kwc()} kWc</strong><small>totale installée</small></div>
            <div><span>ONDULEUR</span><strong>${textValue(state.inverter)}</strong><small>type / marque</small></div>
            <div><span>ORIENTATION</span><strong>${textValue(state.orientation)}</strong><small>${textValue(state.tilt)}° d'inclinaison</small></div>
          </div>
          <p>Type de pose : ${textValue(state.installType)}</p>
        </div>
      </section>

      <section class="middle-grid">
        <div class="panel production-panel">
          <div class="title-row">${sectionNumber(4, 'PRODUCTION ANNUELLE')}</div>
          ${renderChart()}
          <p class="annual"><strong>PRODUCTION PVGIS :</strong> <b>${formatNumber(production)} kWh/an</b> <span>Saisie mensuelle, orientation libre</span></p>
        </div>

        <div class="panel split-panel">
          ${sectionNumber(5, 'RÉPARTITION')}
          <div class="coverage"><strong>COUVERTURE</strong><b>${coverage} %</b></div>
          ${renderDonut()}
        </div>
      </section>

      <section class="economy-grid">
        <div class="panel savings-panel">
          ${sectionNumber(6, 'VOS ÉCONOMIES')}
          <div class="line"><span>Baisse facture</span><strong>${money(saving)}</strong><small>${Number(state.electricityRate || 0).toString().replace('.', ',')} €/kWh</small></div>
          <div class="line"><span>Surplus injecté</span><strong>${money(resale)}</strong><small>${Number(state.exportRate || 0).toString().replace('.', ',')} €/kWh</small></div>
          <div class="total"><span>GAIN ANNUEL TOTAL</span><strong>${money(totalGain())}</strong><small>économies + revente</small></div>
        </div>

        <div class="panel cost-panel">
          ${sectionNumber(7, 'COÛT & RENTABILITÉ')}
          <div class="line"><span>Prix TTC</span><strong>${money(state.price)}</strong></div>
          <div class="line"><span>Aides déduites</span><strong>− ${money(state.grants)}</strong></div>
          <div class="line strong"><span>Reste à charge</span><strong>${money(netCost())}</strong></div>
          <div class="roi"><span>ROI PROJET SANS BATTERIE</span><strong>${roiYears()} ans</strong><small>Calculé sur gain annuel<br />hors batterie</small></div>
        </div>

        <div class="panel projection-panel">
          ${sectionNumber(8, 'ÉCONOMIE RÉALISÉE')}
          <div class="projection-line"><span>Sur 10 ans</span><strong>${money(withoutBattery.totalGain * 10)} / ${money(withBattery.totalGain * 10)}</strong><small>S / B</small></div>
          <div class="projection-line"><span>Sur 15 ans</span><strong>${money(withoutBattery.totalGain * 15)} / ${money(withBattery.totalGain * 15)}</strong><small>S / B</small></div>
          <div class="projection-line"><span>Sur 20 ans</span><strong>${money(withoutBattery.totalGain * 20)} / ${money(withBattery.totalGain * 20)}</strong><small>S / B</small></div>
        </div>
      </section>

      <section class="battery-panel">
        <div class="battery-title"><strong>AVEC ou SANS BATTERIE — Quel impact pour vous ?</strong><em>Comparaison sur 20 ans</em></div>
        <div class="battery-grid">
          <div>
            <h3>SANS BATTERIE</h3>
            <p>Simulation horaire directe</p>
            <dl><div><dt>Autoconsommation</dt><dd>${withoutBattery.selfUsePercent} %</dd></div><div><dt>Couverture conso</dt><dd>${withoutBattery.coverage} %</dd></div><div><dt>Surplus injecté</dt><dd>${formatNumber(withoutBattery.surplus)} kWh</dd></div><div><dt>Gain/an</dt><dd>${money(withoutBattery.totalGain)}</dd></div></dl>
          </div>
          <div>
            <h3>AVEC BATTERIE</h3>
            <p>Stockage ${formatDecimal(state.batteryCapacity)} kWh, rendement ${Math.round(Number(state.batteryEfficiency || 0) * 100)} %</p>
            <dl><div><dt>Autoconsommation</dt><dd>${batterySelfUsePercent} %</dd></div><div><dt>Couverture conso</dt><dd>${withBattery.coverage} %</dd></div><div><dt>Surplus injecté</dt><dd>${formatNumber(withBattery.surplus)} kWh</dd></div><div><dt>Gain/an</dt><dd>${money(batteryEconomy)}</dd></div></dl>
          </div>
          <div>
            <h3>DIFFÉRENCE</h3>
            <p>Écart net 20 ans : ${money(netBattery20Years)}</p>
            <dl><div><dt>Gain en plus</dt><dd>${money(batteryGain)}/an</dd></div><div><dt>Achat évité</dt><dd>${formatNumber(difference.gridPurchase)} kWh</dd></div><div><dt>Gain brut 20 ans</dt><dd>${money(batteryGain * 20)}</dd></div><div><dt>ROI batterie</dt><dd>${batteryRoi()} ans</dd></div></dl>
          </div>
        </div>
      </section>

      <footer class="report-footer">
        <span>Document non contractuel — HABITONTOIT 3 rue du Champenatre 25770 Serre-Les-Sapins</span>
        <strong>${state.consultant}</strong>
        <span>${state.phone} · ${state.email}</span>
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
          ${select('Profil de consommation', 'loadProfile', loadProfiles)}
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
          ${input('Aides déduites (€)', 'grants', 'number', 'min="0"')}
          ${input('Prix kWh acheté (€)', 'electricityRate', 'number', 'min="0" step="0.001"')}
          ${input('Tarif revente surplus (€)', 'exportRate', 'number', 'min="0" step="0.001"')}
          ${input('Capacité batterie (kWh)', 'batteryCapacity', 'number', 'min="0" step="0.1"')}
          ${input('Surcoût batterie (€)', 'batteryCost', 'number', 'min="0"')}
        </div>
      </details>

      <details open>
        <summary>Données mensuelles obligatoires</summary>
        ${curveInputs('Consommation client (kWh)', 'consoCurve')}
        ${curveInputs('Production PVGIS (kWh)', 'pvCurve')}
      </details>

      <details>
        <summary>Contact</summary>
        <div class="form-grid">
          ${input('Nom commercial', 'consultant')}
          ${input('Téléphone', 'phone')}
          ${input('Email', 'email', 'email')}
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
        state[key][Number(index)] = Number(event.target.value) || 0;
        renderPreview();
      });
      return;
    }

    field.addEventListener(field.tagName === 'SELECT' ? 'change' : 'input', (event) => {
      state[event.target.name] = event.target.value;
      renderPreview();
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
