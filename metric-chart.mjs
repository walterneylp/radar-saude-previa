const palette = ['#245c9b', '#14694e', '#845099', '#a55720', '#28777d', '#aa4058'];
const percentage = new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 2});
const currency = new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'});
const compactMoney = new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1});

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export function metricValue(value, unit) {
  if (value == null) return '—';
  if (unit === 'money') return currency.format(value / 100);
  return percentage.format(value) + (unit === 'percent' ? '%' : '');
}

export function metricChart(title, rows, unit) {
  const figure = el('figure', null, 'metric-chart metric-chart-' + unit);
  figure.append(el('figcaption', title));
  const values = rows.map(row => row.value).filter(value => value != null);
  if (!values.length) {
    figure.append(el('p', 'Sem valores publicados para este recorte.'));
    return figure;
  }
  const low = Math.min(0, ...values);
  const high = Math.max(unit === 'percent' ? 100 : 0, ...values);
  const span = high - low || 1;
  const origin = -low / span * 100;
  const axis = el('div', null, 'metric-axis');
  const tick = value => unit === 'money' ? compactMoney.format(value / 100) : metricValue(value, unit);
  axis.append(el('span', tick(low)), el('span', tick(high)));
  figure.append(axis);
  rows.forEach(({label, value, color}, index) => {
    const row = el('div', null, 'metric-row');
    const track = el('div', null, 'metric-track');
    track.setAttribute('aria-hidden', 'true');
    if (value == null) track.classList.add('metric-unavailable');
    if (value) {
      const bar = el('span', null, 'metric-bar');
      bar.style.backgroundColor = color ?? palette[index % palette.length];
      bar.style.left = Math.min(origin, (value - low) / span * 100) + '%';
      bar.style.width = Math.abs(value) / span * 100 + '%';
      track.append(bar);
    }
    if (origin > 0 && origin < 100) {
      const zero = el('span', null, 'metric-zero');
      zero.style.left = origin + '%';
      track.append(zero);
    }
    row.append(el('span', label, 'metric-label'), track, el('span', metricValue(value, unit), 'metric-value'));
    figure.append(row);
  });
  return figure;
}

function replaceOptions(select, options) {
  select.replaceChildren();
  for (const [value, name] of options) {
    const option = el('option', name);
    option.value = value;
    select.append(option);
  }
}

function selectField(parent, label, options, refresh) {
  const field = el('label', label);
  const select = el('select');
  replaceOptions(select, options);
  select.addEventListener('change', refresh);
  field.append(select);
  parent.append(field);
  return select;
}

export function renderEpidemiology(target, {municipios, agravos, dados}) {
  if (!dados.length) return;
  const filters = el('div', null, 'quality-controls');
  const results = el('div');
  results.setAttribute('aria-live', 'polite');
  const catalog = Object.entries(agravos);
  const colors = new Map(catalog.map(([key], index) => [key, palette[index % palette.length]]));
  const available = new Set(dados.map(row => row.agravo));
  const groups = Object.entries({arboviroses: 'Arboviroses', outros: 'Tuberculose, hanseníase e sífilis adquirida'})
    .filter(([group]) => catalog.some(([key, info]) => (info.group ?? 'outros') === group && available.has(key)));
  if (!groups.length) return;
  const city = selectField(filters, 'Município da epidemiologia', Object.entries(municipios), refresh);
  const group = selectField(filters, 'Grupo de agravos', groups, setGroup);
  if (groups.length === 1) group.parentElement.remove();
  const year = selectField(filters, 'Ano de referência do SINAN', [], refresh);
  const disease = selectField(filters, 'Agravo para a série histórica', [], refresh);
  const basisNote = el('p', null, 'quality-note');
  let entries, groupRows, years;
  target.replaceChildren(filters, basisNote, results,
    el('p', 'Um traço indica dado indisponível no recorte. Edições preliminares podem mudar. O ano em curso é parcial.', 'quality-note'));
  setGroup();

  function setGroup() {
    const previousYear = Number(year.value);
    entries = catalog.filter(([, info]) => (info.group ?? 'outros') === group.value);
    const keys = new Set(entries.map(([key]) => key));
    groupRows = dados.filter(row => keys.has(row.agravo));
    years = [...new Set(groupRows.map(row => row.ano))].sort((a, b) => b - a);
    replaceOptions(year, years.map(value => [value, value]));
    replaceOptions(disease, entries.map(([key, info]) => [key, info.label]));
    const complete = years.find(value => entries.every(([key]) =>
      groupRows.some(row => row.ibge === city.value && row.agravo === key && row.ano === value)));
    year.value = String(years.includes(previousYear) ? previousYear : complete ?? years[0]);
    basisNote.textContent = group.value === 'arboviroses'
      ? 'Notificações do SINAN por município de residência e ano epidemiológico dos primeiros sintomas. Os totais incluem registros de diferentes classificações.'
      : 'Contagens por município de residência. Tuberculose segue o ano do diagnóstico. Hanseníase e sífilis adquirida seguem o ano da notificação.';
    refresh();
  }

  function refresh() {
    const chosenYear = Number(year.value);
    const local = groupRows.filter(row => row.ibge === city.value);
    const chosen = new Map(local.filter(row => row.ano === chosenYear).map(row => [row.agravo, row]));
    const color = colors.get(disease.value);
    const history = new Map(local.filter(row => row.agravo === disease.value).map(row => [row.ano, row]));
    const figures = el('div', null, 'quality-figures');
    const measure = group.value === 'arboviroses' ? 'Notificações' : 'Registros';
    figures.append(metricChart(measure + ' por agravo · ' + chosenYear, entries.map(([key, info]) => ({
      label: info.label, value: chosen.get(key)?.notificacoes, color: colors.get(key),
    })), 'count'));
    figures.append(metricChart(agravos[disease.value].label + ' · Série histórica', years.filter(value => value <= chosenYear)
      .reverse().map(value => {
        const record = history.get(value);
        return {label: value + (record?.situacao === 'preliminar' ? ' · Preliminar' : ''),
          value: record?.notificacoes, color};
      }), 'count'));
    results.replaceChildren(figures, yearTable(chosen, measure));
  }

  function yearTable(chosen, measure) {
    const box = el('div', null, 'quality-table');
    box.tabIndex = 0;
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'Contagens e arquivos do ano selecionado');
    const table = el('table');
    const head = table.createTHead().insertRow();
    for (const label of ['Agravo', measure, 'Referência do ano', 'Situação', 'Arquivo SINAN', 'Atualização do arquivo']) {
      const cell = el('th', label);
      cell.scope = 'col';
      head.append(cell);
    }
    const body = table.createTBody();
    for (const [key, info] of entries) {
      const data = chosen.get(key);
      const row = body.insertRow();
      const label = el('th', info.label);
      label.scope = 'row';
      row.append(label, el('td', metricValue(data?.notificacoes, 'count')), el('td', info.basis),
        el('td', data ? (data.situacao === 'final' ? 'Final' : 'Preliminar') : 'Sem arquivo neste recorte'),
        el('td', data?.arquivo ?? '—'), el('td', data?.arquivo_atualizado.split('-').reverse().join('/') ?? '—'));
    }
    box.append(table);
    return box;
  }
}
