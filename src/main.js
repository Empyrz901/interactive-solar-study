import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const months = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const pvProfile = [270, 380, 580, 740, 890, 980, 950, 850, 670, 470, 310, 240];
const consoCurve = [480, 450, 410, 350, 300, 270, 260, 280, 330, 390, 450, 490];
const defaultAnnualYieldPerKwc = 1220;
const defaultElectricityRate = 0.18;
const defaultExportRate = 0.13;
const batterySelfUseGain = 0.34;

const state = {
  clientName: '',
  address: '',
  date: new Date().toLocaleDateString('fr-FR'),
  reference: '',
  consumption: '8500',
  heating: 'Électrique',
  occupants: '4',
  equipments: ['Cumulus / ECS', 'Climatisation'],
  panels: 12,
  panelWc: 500,
  inverter: 'Micro-onduleurs',
  orientation: 'Est / Ouest',
  tilt: '30',
  installType: 'Surimposition toiture',
  price: 15900,
  grants: 1800,
  selfUse: 42,
  batteryCost: 6900,
  pvCurve: buildPvCurve(12, 500),
  consoCurve: [...consoCurve],
  pvCurveOverridden: false,
  photo: '',
  consultant: 'VOTRE EXPERT PHOTOVOLTAÏQUE',
  phone: '0648042171',
  email: 'habitontoit@gmail.com'
};

function buildPvCurve(panels, panelWc) {
  const annualTarget = (Number(panels || 0) * Number(panelWc || 0) * defaultAnnualYieldPerKwc) / 1000;
  const profileTotal = pvProfile.reduce((sum, value) => sum + value, 0);
  const monthly = pvProfile.map((value) => Math.round((value / profileTotal) * annualTarget));
  const delta = Math.round(annualTarget) - monthly.reduce((sum, value) => sum + value, 0);
  monthly[monthly.length - 1] += delta;
  return monthly;
}

const equipmentOptions = [
  'Cumulus / ECS',
  'Climatisation',
  'Piscine',
  'Voiture électrique',
  'Pompe à chaleur'
];

function formatNumber(value) {
  const number = Number(value) || 0;
  return new Intl.NumberFormat('fr-FR').format(Math.round(number));
}

function kwc() {
  return ((Number(state.panels || 0) * Number(state.panelWc || 0)) / 1000).toFixed(1).replace('.', ',');
}

function annualProduction() {
  return state.pvCurve.reduce((sum, value) => sum + Number(value || 0), 0);
}

function selfUseRate() {
  return Math.max(0, Math.min(100, Number(state.selfUse || 0))) / 100;
}

function selfConsumedKwh() {
  return Math.round(annualProduction() * selfUseRate());
}

function exportedKwh() {
  return Math.max(0, annualProduction() - selfConsumedKwh());
}

function billSaving() {
  return Math.round(selfConsumedKwh() * defaultElectricityRate);
}

function resaleGain() {
  return Math.round(exportedKwh() * defaultExportRate);
}

function coverageRate() {
  const consumption = Number(state.consumption || 0);
  if (!consumption) return 0;
  return Math.min(100, Math.round((selfConsumedKwh() / consumption) * 100));
}

function batterySelfUseRate() {
  return Math.min(0.8, selfUseRate() + batterySelfUseGain);
}

function batterySaving() {
  const extraSelfConsumed = Math.max(0, Math.round(annualProduction() * (batterySelfUseRate() - selfUseRate())));
  return Math.round(extraSelfConsumed * (defaultElectricityRate - defaultExportRate));
}

function totalGain() {
  return billSaving() + resaleGain();
}

function netCost() {
  return Math.max(0, Number(state.price || 0) - Number(state.grants || 0));
}

function roiYears() {
  const gain = totalGain();
  return gain ? Math.max(1, Math.round((netCost() / gain) * 10) / 10).toString().replace('.', ',') : '...';
}

function batteryRoi() {
  const gain = batterySaving();
  return gain ? Math.max(1, Math.round((Number(state.batteryCost || 0) / gain) * 10) / 10).toString().replace('.', ',') : '...';
}

function input(label, key, type = 'text', attrs = '') {
  return `
    <label class="field">
      <span>${label}</span>
      <input name="${key}" type="${type}" value="${state[key]}" ${attrs} />
    </label>
  `;
}

function checkbox(option) {
  const checked = state.equipments.includes(option) ? 'checked' : '';
  return `
    <label class="check">
      <input type="checkbox" name="equipment" value="${option}" ${checked} />
      <span>${option}</span>
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
        ${months
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
  const selfUse = Math.round(selfUseRate() * 100);
  const sold = 100 - selfUse;
  return `
    <canvas class="donut" width="140" height="140" data-self="${selfUse}" aria-label="Répartition de la production"></canvas>
    <p class="self-used"><strong>Autoconsommé</strong> ${selfUse}%</p>
    <p class="exported-surplus"><strong>Surplus injecté</strong> ${sold}%</p>
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
  const production = annualProduction();
  const coverage = coverageRate();
  const saving = billSaving();
  const resale = resaleGain();
  const batteryGain = batterySaving();
  const batteryEconomy = saving + batteryGain;
  const batterySelfUsePercent = Math.round(batterySelfUseRate() * 100);
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
                ? `<img src="${state.photo}" alt="Maison du client" />`
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
            <div><dt>Conso/an :</dt><dd>${formatNumber(state.consumption)} kWh</dd></div>
            <div><dt>Chauffage :</dt><dd>${textValue(state.heating)}</dd></div>
            <div><dt>Occupants :</dt><dd>${textValue(state.occupants)}</dd></div>
          </dl>
          <h3>ÉQUIPEMENTS :</h3>
          <ul>${equipmentOptions.map((item) => `<li class="${state.equipments.includes(item) ? 'active' : ''}">${item}</li>`).join('')}</ul>
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
          <p class="annual"><strong>PRODUCTION ANNUELLE ESTIMÉE :</strong> <b>${formatNumber(production)} kWh/an</b> <span>Selon pans</span></p>
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
          <div class="line"><span>Baisse facture</span><strong>${money(saving)}</strong><small>/ an</small></div>
          <div class="line"><span>Surplus injecté</span><strong>${money(resale)}</strong><small>/ an</small></div>
          <div class="total"><span>GAIN ANNUEL TOTAL</span><strong>${money(totalGain())}</strong><small>économies + revente</small></div>
        </div>

        <div class="panel cost-panel">
          ${sectionNumber(7, 'COÛT & RENTABILITÉ')}
          <div class="line"><span>Prix TTC</span><strong>${money(state.price)}</strong></div>
          <div class="line"><span>Aides déduites</span><strong>− ${money(state.grants)}</strong></div>
          <div class="line strong"><span>Reste à charge</span><strong>${money(netCost())}</strong></div>
          <div class="roi"><span>RETOUR SUR INVESTISSEMENT</span><strong>${roiYears()} ans</strong><small>Puis 100% de gain<br />jusqu'à 25-30 ans</small></div>
        </div>

        <div class="panel projection-panel">
          ${sectionNumber(8, 'ÉCONOMIE RÉALISÉE')}
          <div class="projection-line"><span>Sur 10 ans</span><strong>${money(totalGain() * 10)}</strong></div>
          <div class="projection-line"><span>Sur 15 ans</span><strong>${money(totalGain() * 15)}</strong></div>
          <div class="projection-line"><span>Sur 20 ans</span><strong>${money(totalGain() * 20)}</strong></div>
        </div>
      </section>

      <section class="battery-panel">
        <div class="battery-title"><strong>AVEC ou SANS BATTERIE — Quel impact pour vous ?</strong><em>Comparaison sur 20 ans</em></div>
        <div class="battery-grid">
          <div>
            <h3>SANS BATTERIE</h3>
            <p>Autoconsommation classique</p>
            <dl><div><dt>Autoconsommation</dt><dd>≈ ${Math.round(selfUseRate() * 100)} %</dd></div><div><dt>Économie/an</dt><dd>${money(saving)}</dd></div><div><dt>Surcoût matériel</dt><dd>0 €</dd></div></dl>
          </div>
          <div>
            <h3>AVEC BATTERIE</h3>
            <p>Stockage ≈ 5 à 10 kWh</p>
            <dl><div><dt>Autoconsommation</dt><dd>≈ ${batterySelfUsePercent} %</dd></div><div><dt>Économie/an</dt><dd>${money(batteryEconomy)}</dd></div><div><dt>Surcoût matériel</dt><dd>+ ${money(state.batteryCost)}</dd></div></dl>
          </div>
          <div>
            <h3>DIFFÉRENCE</h3>
            <p>Gain supplémentaire / an</p>
            <dl><div><dt>Gain en plus</dt><dd>+ ${money(batteryGain)}/an</dd></div><div><dt>Sur 20 ans</dt><dd>+ ${money(batteryGain * 20)}</dd></div><div><dt>ROI batterie</dt><dd>${batteryRoi()} ans</dd></div></dl>
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
          ${input('Consommation annuelle (kWh)', 'consumption', 'number', 'min="0"')}
          ${input('Chauffage', 'heating')}
          ${input('Occupants', 'occupants', 'number', 'min="1"')}
        </div>
        <div class="checks">${equipmentOptions.map(checkbox).join('')}</div>
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
          ${input('Autoconsommée (%)', 'selfUse', 'number', 'min="0" max="100"')}
          ${input('Surcoût batterie (€)', 'batteryCost', 'number', 'min="0"')}
        </div>
      </details>

      <details>
        <summary>Courbes mensuelles</summary>
        ${curveInputs('Production PV (kWh)', 'pvCurve')}
        ${curveInputs('Consommation (kWh)', 'consoCurve')}
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
  document.querySelectorAll('input[name]').forEach((field) => {
    if (field.name === 'equipment') {
      field.addEventListener('change', () => {
        state.equipments = [...document.querySelectorAll('input[name="equipment"]:checked')].map((item) => item.value);
        renderPreview();
      });
      return;
    }

    if (field.name.includes(':')) {
      field.addEventListener('input', (event) => {
        const [key, index] = event.target.name.split(':');
        state[key][Number(index)] = Number(event.target.value) || 0;
        if (key === 'pvCurve') {
          state.pvCurveOverridden = true;
        }
        renderPreview();
      });
      return;
    }

    field.addEventListener('input', (event) => {
      state[event.target.name] = event.target.value;
      if ((event.target.name === 'panels' || event.target.name === 'panelWc') && !state.pvCurveOverridden) {
        state.pvCurve = buildPvCurve(state.panels, state.panelWc);
        document.querySelectorAll('input[name^="pvCurve:"]').forEach((input) => {
          const index = Number(input.name.split(':')[1]);
          input.value = state.pvCurve[index];
        });
      }
      renderPreview();
    });
  });

  document.querySelector('#photoInput')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      state.photo = reader.result;
      renderPreview();
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
