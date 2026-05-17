import './styles.css';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const months = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const pvCurve = [270, 380, 580, 740, 890, 980, 950, 850, 670, 470, 310, 240];
const consoCurve = [480, 450, 410, 350, 300, 270, 260, 280, 330, 390, 450, 490];

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
  inverter: 'Micro-onduleurs',
  orientation: '180',
  tilt: '30',
  installType: 'Surimposition toiture',
  price: 15900,
  grants: 1800,
  billSaving: 1180,
  resale: 280,
  selfUse: 42,
  coverage: 58,
  batterySaving: 420,
  batteryCost: 6900,
  pvCurve: [...pvCurve],
  consoCurve: [...consoCurve],
  photo: '',
  consultant: 'VOTRE EXPERT PHOTOVOLTAÏQUE',
  phone: '06 40 20 25 89',
  email: 'contact@exemple.fr'
};

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
  return (Number(state.panels || 0) * 0.5).toFixed(1).replace('.', ',');
}

function annualProduction() {
  return state.pvCurve.reduce((sum, value) => sum + Number(value || 0), 0);
}

function totalGain() {
  return Number(state.billSaving || 0) + Number(state.resale || 0);
}

function netCost() {
  return Math.max(0, Number(state.price || 0) - Number(state.grants || 0));
}

function roiYears() {
  const gain = totalGain();
  return gain ? Math.max(1, Math.round((netCost() / gain) * 10) / 10).toString().replace('.', ',') : '...';
}

function batteryRoi() {
  const gain = Number(state.batterySaving || 0);
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
  const bars = state.pvCurve
    .map((value, index) => {
      const pvHeight = Math.max(8, (value / max) * 92);
      const cHeight = Math.max(8, (state.consoCurve[index] / max) * 92);
      return `
        <div class="bar-pair">
          <div class="bars">
            <i class="pv" style="height:${pvHeight}%"></i>
            <i class="use" style="height:${cHeight}%"></i>
          </div>
          <b>${months[index]}</b>
        </div>
      `;
    })
    .join('');

  return `
    <div class="legend"><span><i class="pv-dot"></i>Production PV</span><span><i class="use-dot"></i>Consommation</span></div>
    <div class="chart-grid">
      <div class="axis">${axis.map((value) => `<span>${formatNumber(value)}</span>`).join('')}</div>
      <div class="chart-bars">${bars}</div>
    </div>
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
  const selfUse = Math.max(0, Math.min(100, Number(state.selfUse) || 0));
  const sold = 100 - selfUse;
  return `
    <div class="donut" style="--p:${selfUse}">
      <div><strong>Production</strong><b>100%</b></div>
    </div>
    <p><strong>Autoconsommée</strong> ${selfUse}%</p>
    <p><strong>Revendue</strong> ${sold}%</p>
  `;
}

function renderReport() {
  const production = annualProduction();
  return `
    <article id="report" class="report" aria-label="Étude photovoltaïque">
      <header class="report-header">
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
            ${state.photo ? `<img src="${state.photo}" alt="Maison du client" />` : '<span>PHOTO CLIENT À INSÉRER</span>'}
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
            <div><span>NB PANNEAUX</span><strong>${textValue(state.panels)}</strong><small>× 500 Wc</small></div>
            <div><span>PUISSANCE</span><strong>${kwc()} kWc</strong><small>totale installée</small></div>
            <div><span>ONDULEUR</span><strong>${textValue(state.inverter)}</strong><small>type / marque</small></div>
            <div><span>ORIENTATION</span><strong>${textValue(state.orientation)}°</strong><small>${textValue(state.tilt)}° d'inclinaison</small></div>
          </div>
          <p>Type de pose : ${textValue(state.installType)}</p>
        </div>
      </section>

      <section class="middle-grid">
        <div class="panel production-panel">
          <div class="title-row">${sectionNumber(4, 'PRODUCTION ANNUELLE (ILLUSTRATION)')}<em>Courbe type — à personnaliser</em></div>
          ${renderChart()}
          <p class="annual"><strong>PRODUCTION ANNUELLE ESTIMÉE :</strong> <b>${formatNumber(production)} kWh/an</b> <span>selon orientation + ensoleillement</span></p>
        </div>

        <div class="panel split-panel">
          ${sectionNumber(5, 'RÉPARTITION')}
          <div class="coverage"><strong>COUVERTURE</strong><b>${state.coverage} %</b></div>
          ${renderDonut()}
        </div>
      </section>

      <section class="economy-grid">
        <div class="panel savings-panel">
          ${sectionNumber(6, 'VOS ÉCONOMIES')}
          <div class="line"><span>Baisse facture</span><strong>${money(state.billSaving)}</strong><small>/ an</small></div>
          <div class="line"><span>Revente surplus</span><strong>${money(state.resale)}</strong><small>/ an</small></div>
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
          ${sectionNumber(8, 'PROJECTION LONG TERME')}
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
            <dl><div><dt>Autoconsommation</dt><dd>≈ 30-40 %</dd></div><div><dt>Économie/an</dt><dd>${money(state.billSaving)}</dd></div><div><dt>Surcoût matériel</dt><dd>0 €</dd></div></dl>
          </div>
          <div>
            <h3>AVEC BATTERIE</h3>
            <p>Stockage ≈ 5 à 10 kWh</p>
            <dl><div><dt>Autoconsommation</dt><dd>≈ 70-80 %</dd></div><div><dt>Économie/an</dt><dd>${money(Number(state.billSaving) + Number(state.batterySaving))}</dd></div><div><dt>Surcoût matériel</dt><dd>+ ${money(state.batteryCost)}</dd></div></dl>
          </div>
          <div>
            <h3>DIFFÉRENCE</h3>
            <p>Gain supplémentaire / an</p>
            <dl><div><dt>Gain en plus</dt><dd>+ ${money(state.batterySaving)}/an</dd></div><div><dt>Sur 20 ans</dt><dd>+ ${money(Number(state.batterySaving) * 20)}</dd></div><div><dt>ROI batterie</dt><dd>${batteryRoi()} ans</dd></div></dl>
          </div>
        </div>
      </section>

      <footer class="report-footer">
        <span>Document non contractuel — Étude personnalisée</span>
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
          ${input('Onduleur', 'inverter')}
          ${input('Orientation (degrés)', 'orientation', 'number')}
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
          ${input('Baisse facture annuelle (€)', 'billSaving', 'number', 'min="0"')}
          ${input('Revente surplus annuelle (€)', 'resale', 'number', 'min="0"')}
          ${input('Prix TTC (€)', 'price', 'number', 'min="0"')}
          ${input('Aides déduites (€)', 'grants', 'number', 'min="0"')}
          ${input('Autoconsommée (%)', 'selfUse', 'number', 'min="0" max="100"')}
          ${input('Couverture (%)', 'coverage', 'number', 'min="0" max="100"')}
          ${input('Gain batterie annuel (€)', 'batterySaving', 'number', 'min="0"')}
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
}

function renderPreview() {
  document.querySelector('#previewScale').innerHTML = renderReport();
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
        renderPreview();
      });
      return;
    }

    field.addEventListener('input', (event) => {
      state[event.target.name] = event.target.value;
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

render();
