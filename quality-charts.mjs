const concepts = ['Regular', 'Suficiente', 'Bom', 'Ótimo'];
const groups = [['C', 'C · Saúde da Família'], ['B', 'B · Saúde Bucal'], ['M', 'M · eMulti']];
const teams = ['eSF', 'eAP', 'eSB', 'eMulti'];
const number = new Intl.NumberFormat('pt-BR');
const display = value => value == null ? '—' : number.format(value);

function element(tag, label, className) {
  const node = document.createElement(tag);
  if (label != null) node.textContent = label;
  if (className) node.className = className;
  return node;
}

function options(select, values, selected) {
  select.replaceChildren(...values.map(([value, label]) => {
    const item = element('option', label);
    item.value = value;
    return item;
  }));
  select.value = values.some(([value]) => value === selected) ? selected : (values[0]?.[0] ?? '');
  select.disabled = values.length === 0;
}

function control(parent, label, onChange) {
  const field = element('label', label);
  const select = element('select');
  select.addEventListener('change', onChange);
  field.append(select);
  parent.append(field);
  return select;
}

function distributions(rows, team, group) {
  const data = new Map();
  for (const row of rows) {
    if (row.tipo_equipe !== team || !row.indicador.startsWith(group)) continue;
    if (!data.has(row.indicador)) {
      data.set(row.indicador, {
        label: [row.indicador, row.nome].filter(Boolean).join(' · '), counts: new Map(),
      });
    }
    data.get(row.indicador).counts.set(row.conceito, row.equipes);
  }
  return new Map([...data].sort(([a], [b]) => a.localeCompare(b)));
}

function countsTable(rows) {
  const extra = new Set(rows.flatMap(row => [...row.counts.keys()]).filter(concept => !concepts.includes(concept)));
  const headings = [...concepts, ...extra];
  const details = element('details');
  const scroller = element('div', null, 'quality-table');
  scroller.tabIndex = 0;
  scroller.setAttribute('role', 'region');
  scroller.setAttribute('aria-label', 'Contagens publicadas por conceito');
  const table = element('table');
  const header = table.createTHead().insertRow();
  for (const heading of ['Recorte', ...headings]) {
    const cell = element('th', heading);
    cell.scope = 'col';
    header.append(cell);
  }
  const body = table.createTBody();
  for (const {label, counts} of rows) {
    const row = body.insertRow();
    const name = element('th', label);
    name.scope = 'row';
    row.append(name, ...headings.map(concept => element('td', display(counts.get(concept)))));
  }
  scroller.append(table);
  details.append(element('summary', 'Ver contagens exatas'), scroller);
  return details;
}

function chart(title, rows) {
  const figure = element('figure', null, 'quality-figure');
  figure.append(element('figcaption', title));
  if (!rows.length) {
    figure.append(element('p', 'Sem resultado publicado para o recorte selecionado.'));
    return figure;
  }
  const total = row => concepts.reduce((sum, concept) => sum + (row.counts.get(concept) ?? 0), 0);
  const max = Math.max(...rows.map(total));
  const axis = element('div', null, 'quality-axis');
  axis.append(element('span', '0'), element('span', max ? number.format(max) + ' equipes' : 'Equipes'));
  figure.append(axis);
  for (const row of rows) {
    const block = element('div', null, 'quality-row');
    const track = element('div', null, 'quality-track');
    const known = concepts.filter(concept => row.counts.get(concept) != null);
    const value = element('span', known.length === concepts.length ? display(total(row))
      : known.length ? 'Parcial' : 'Sem resultado', 'quality-total');
    if (known.length) {
      track.setAttribute('role', 'img');
      track.setAttribute('aria-label', concepts.map(concept => concept + ' ' + display(row.counts.get(concept))).join(', '));
    } else {
      track.classList.add('quality-unavailable');
      track.setAttribute('aria-hidden', 'true');
    }
    for (const [index, concept] of concepts.entries()) {
      const count = row.counts.get(concept);
      if (!count) continue;
      const width = count / max * 100;
      const segment = element('span', width >= 13 ? display(count) : '', 'quality-color-' + index);
      segment.style.width = width + '%';
      segment.title = concept + ' · ' + display(count);
      track.append(segment);
    }
    block.append(element('span', row.label, 'quality-row-label'), track, value);
    figure.append(block);
  }
  figure.append(countsTable(rows));
  return figure;
}

export function renderQualityCharts(target, municipalities, fixedGroup, selection = {}) {
  if (!municipalities.length) return;
  const controls = element('div', null, 'quality-controls');
  const content = element('div', null, 'quality-figures');
  content.setAttribute('aria-live', 'polite');
  const city = control(controls, 'Município da qualidade', refresh);
  options(city, municipalities.map(item => [item.ibge, item.label]), selection.city);
  const group = fixedGroup ? null : control(controls, 'Grupo de indicadores', refresh);
  if (group) options(group, groups, selection.group);
  const team = control(controls, 'Tipo de equipe', refresh);
  const indicator = control(controls, 'Indicador para comparar', refresh);
  const legend = element('ul', null, 'quality-legend');
  for (const [index, concept] of concepts.entries()) {
    const item = element('li');
    item.append(element('span', null, 'quality-color-' + index), concept);
    legend.append(item);
  }
  target.replaceChildren(controls, legend, content, element('p',
    'As barras mostram contagens de equipes nos quatro conceitos. Cada indicador tem seu próprio total. O traço indica valor indisponível.',
    'quality-note'));
  refresh();

  function refresh() {
    const groupCode = fixedGroup || group.value;
    const availableTeams = new Set(municipalities.flatMap(item => item.rows
      .filter(row => row.indicador.startsWith(groupCode)).map(row => row.tipo_equipe)));
    options(team, teams.filter(item => availableTeams.has(item)).map(item => [item, item]), team.value || selection.team);
    const byCity = new Map(municipalities.map(item => [item.ibge, distributions(item.rows, team.value, groupCode)]));
    const definitions = new Map();
    for (const distributions of byCity.values()) {
      for (const [key, row] of distributions) definitions.set(key, row.label);
    }
    options(indicator, [...definitions].sort(([a], [b]) => a.localeCompare(b)), indicator.value || selection.indicator);
    const selected = municipalities.find(item => item.ibge === city.value);
    const compared = indicator.value ? municipalities.map(item => ({
      label: item.label, counts: byCity.get(item.ibge).get(indicator.value)?.counts ?? new Map(),
    })) : [];
    content.replaceChildren(chart('Equipes por conceito em ' + selected.label, [...byCity.get(city.value).values()]),
      chart('Comparação municipal' + (indicator.value ? ' · ' + definitions.get(indicator.value) + ' · ' + team.value : ''), compared));
    Object.assign(selection, {city: city.value, group: groupCode, team: team.value, indicator: indicator.value});
  }
}
