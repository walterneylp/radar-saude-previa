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

export function downloadCsv(filename, rows) {
  const quote = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
  const url = URL.createObjectURL(new Blob(['\ufeff', rows.map(row => row.map(quote).join(';')).join('\r\n')],
    {type: 'text/csv;charset=utf-8'}));
  const link = el('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  select.setAttribute('aria-label', label);
  replaceOptions(select, options);
  select.addEventListener('change', refresh);
  field.append(select);
  parent.append(field);
  return select;
}

function reportTable(headers, rows, label) {
  const wrapper = el('div', null, 'quality-table');
  wrapper.setAttribute('role', 'region');
  wrapper.setAttribute('aria-label', label);
  wrapper.tabIndex = 0;
  const table = el('table');
  const head = table.createTHead().insertRow();
  for (const title of headers) {
    const cell = el('th', title);
    cell.scope = 'col';
    head.append(cell);
  }
  const body = table.createTBody();
  for (const [title, ...values] of rows) {
    const row = body.insertRow();
    const cell = el('th', title);
    cell.scope = 'row';
    row.append(cell, ...values.map(value => el('td', value)));
  }
  wrapper.append(table);
  return wrapper;
}

export function renderMunicipalNetwork(target, {municipios, dados}) {
  if (!dados.length) return;
  const filters = el('div', null, 'quality-controls');
  const detail = el('div');
  detail.setAttribute('aria-live', 'polite');
  const city = selectField(filters, 'Município da rede pública', dados.map(row => [row.ibge, municipios[row.ibge]]), refresh);
  target.replaceChildren(filters, el('p', 'Esfera jurídica · Administração Pública Municipal', 'quality-note'), detail);
  refresh();

  function refresh() {
    const {total, tipos} = dados.find(row => row.ibge === city.value);
    const rows = [...tipos].sort((a, b) => b.quantidade - a.quantidade || a.tipo.localeCompare(b.tipo, 'pt-BR'));
    const link = el('a', 'Consultar filtros no TabNet');
    const state = city.value.startsWith('27') ? 'al' : 'pe';
    link.href = 'https://tabnet.datasus.gov.br/cgi/deftohtm.exe?cnes/cnv/estab' + state + '.def';
    detail.replaceChildren(el('p', metricValue(total, 'count') + ' estabelecimentos no recorte', 'value'),
      metricChart('Estabelecimentos por tipo', rows.map(row => ({label: row.tipo, value: row.quantidade})), 'count'),
      reportTable(['Tipo de estabelecimento', 'Quantidade'],
        [['Total', metricValue(total, 'count')], ...rows.map(row => [row.tipo, metricValue(row.quantidade, 'count')])],
        'Totais do CNES por tipo'), el('p'));
    detail.lastElementChild.append(link);
  }
}

export function renderApsPayments(target, {municipios, dados, componentes, validacoes}) {
  if (!dados.length) return;
  const filters = el('div', null, 'quality-controls');
  const detail = el('div');
  detail.setAttribute('aria-live', 'polite');
  const months = [...new Set(dados.map(row => row.parcela))].sort().reverse();
  const date = value => value.split('-').reverse().join('/');
  const city = selectField(filters, 'Município do pagamento APS', Object.entries(municipios), refresh);
  if (municipios['2700300']) city.value = '2700300';
  const payment = selectField(filters, 'Parcela financeira', months.map(month => [month, date(month)]), refresh);
  const component = selectField(filters, 'Componente APS', Object.entries(componentes), refresh);
  if (dados.some(row => row.detalhes?.esf)) component.value = 'esf';
  const sources = el('ul', null, 'quality-note');
  for (const [label, url] of [
    ['Equipes e estabelecimentos homologados', 'https://relatorioaps.saude.gov.br/gerenciaaps/ines-cnes-homologados'],
    ['Equipes e serviços com ausência de envio de produção', 'https://relatorioaps.saude.gov.br/gerenciaaps/ausencia-envio-producao'],
    ['Solicitações de credenciamento e custeio', 'https://gaps.saude.gov.br/gestaofederal/publico/relatorio-solicitacoes'],
    ['Critérios e tetos de credenciamento · Nota Técnica 282/2023', 'https://www.gov.br/saude/pt-br/centrais-de-conteudo/publicacoes/notas-tecnicas/2023/nota-tecnica-no-282-2023.pdf'],
    ['Estratos do IED · Nota Técnica 122/2024', 'https://www.gov.br/saude/pt-br/centrais-de-conteudo/publicacoes/notas-tecnicas/2024/nota-tecnica-no-122-2024-cgfap-saps-ms.pdf/view'],
    ['Valores e regras de cofinanciamento · Portaria de Consolidação 6/2017', 'https://bvsms.saude.gov.br/bvs/saudelegis/gm/2017/prc0006_03_10_2017_comp.html'],
    ['Vínculo e qualidade · Nota Técnica 8/2026', 'https://www.gov.br/saude/pt-br/centrais-de-conteudo/publicacoes/notas-tecnicas/2026/nota-tecnica-no-8-2026-deaps-saps-ms.pdf/view'],
    ['Credenciamento e valores de referência da Saúde Bucal', 'https://www.gov.br/saude/pt-br/composicao/saps/brasil-sorridente/saude-bucal-na-aps/credenciamento-de-esb/credenciamento-de-esb/'],
  ]) {
    const item = el('li');
    const link = el('a', label);
    link.href = url;
    item.append(link);
    sources.append(item);
  }
  target.replaceChildren(filters, el('p', 'O e-Gestor apresenta o valor a que o município faz jus na parcela. As transferências efetivadas são consultadas no painel do FNS.', 'quality-note'), detail,
    el('h4', 'Consultas relacionadas no e-Gestor'), sources);
  refresh();

  function refresh() {
    const row = dados.find(item => item.ibge === city.value && item.parcela === payment.value);
    if (!row) {
      detail.replaceChildren(el('p', 'Parcela indisponível para este município.'));
      return;
    }
    const kind = component.value;
    const stats = row.componentes[kind] ?? {};
    const team = row.detalhes?.[kind];
    const rows = [['Teto publicado', stats.teto], ['Credenciados', stats.credenciados],
      ['Homologados', stats.homologados], ['Pagos', stats.pagos]].map(([label, value]) => ({label, value}));
    const figures = el('div', null, 'quality-figures');
    const financial = row.planos.map(plan => ({label: plan.plano, value: plan.centavos}));
    figures.append(metricChart(componentes[kind], rows, 'count'));
    if (team) {
      const amounts = Object.entries(team.valores).filter(([key, value]) => key !== 'total' && value != null)
        .map(([key, value]) => ({label: paymentLabels[key], value}));
      figures.append(metricChart('Valores do componente na parcela', amounts, 'money'));
    } else {
      figures.append(metricChart('Custeio da parcela por plano orçamentário', financial, 'money'));
    }
    detail.replaceChildren(el('p', 'Competência CNES usada pelo e-Gestor · ' + date(row.competencia_cnes), 'quality-note'), figures);
    if (stats.teto != null && stats.credenciados != null) {
      const shared = ['esf', 'eap'].includes(kind) && row.componentes.esf?.credenciados != null
        && row.componentes.eap?.credenciados != null;
      const occupied = shared
        ? kind === 'esf' ? row.componentes.esf.credenciados + row.componentes.eap.credenciados / 2
          : row.componentes.esf.credenciados * 2 + row.componentes.eap.credenciados
        : stats.credenciados;
      const difference = stats.teto - occupied;
      const summary = difference >= 0 ? 'Margem até o teto publicado' : 'Credenciados acima do teto';
      const wholeTeams = difference >= 0 ? Math.floor(difference) : -difference;
      detail.append(el('p', summary + ' · ' + metricValue(wholeTeams, 'count') +
        (shared ? '. O teto é compartilhado. Duas eAP equivalem a uma eSF.' : '.') +
        ' A aprovação de novos credenciamentos segue os critérios do Ministério da Saúde.', 'quality-note'));
    }
    if (['esf', 'eap', 'esb'].includes(kind)) {
      detail.append(el('h4', 'Detalhamento da equipe'));
      if (team) appendTeamPayment(detail, kind, team, financial);
      else detail.append(el('p', 'Detalhamento indisponível para esta parcela.'));
    }
    if (kind === 'acs') {
      detail.append(el('h4', 'Validação de ACS'));
      if (row.validacao_acs) {
        detail.append(reportTable(['Situação na fonte', 'Registros'], Object.entries(validacoes)
          .map(([key, title]) => [title, metricValue(row.validacao_acs[key], 'count')]), 'Validações agregadas de ACS'),
          el('p', 'Um registro pode aparecer em mais de uma situação. Equipe inativa descreve o vínculo indicado pelo e-Gestor.', 'quality-note'));
      } else {
        detail.append(el('p', 'Detalhamento de ACS indisponível para esta parcela.'));
      }
    }
  }
}

const paymentLabels = {
  equidade: 'Componente Equidade', qualidade: 'Qualidade', vinculo: 'Vínculo e acompanhamento territorial',
  implantacao: 'Implantação de equipes', ajuste: 'Ajuste', desconto: 'Desconto', total: 'Total na fonte',
  pagamento: 'Pagamento de custeio', pagas_20h: 'Equipes pagas de 20 h', pagas_30h: 'Equipes pagas de 30 h',
  pagas_i: 'Equipes pagas · Modalidade I', pagas_ii: 'Equipes pagas · Modalidade II',
  quilombolas_assentados_i: 'Quilombolas e assentados · Modalidade I',
  quilombolas_assentados_ii: 'Quilombolas e assentados · Modalidade II',
  modalidade_i: 'Custeio por equipe · Modalidade I', modalidade_ii: 'Custeio por equipe · Modalidade II',
};
const suspensionLabels = {
  producao: 'Ausência de envio de produção', duplicidade: 'Duplicidade', composicao: 'Composição da equipe',
  controle: 'Órgão de controle', vinculo: 'Vínculo', carga_horaria: 'Carga horária',
};

function appendTeamPayment(target, kind, team, financial) {
  const groups = kind === 'esb'
    ? [['Classificações de qualidade na parcela', team.classificacoes_qualidade?.join(', ') || '—']]
    : [['Estrato municipal do IED', team.estrato == null ? '—' : 'Estrato ' + team.estrato],
      ['Classificação municipal de qualidade', team.classificacao_qualidade ?? '—'],
      ['Classificação municipal de vínculo', team.classificacao_vinculo ?? '—']];
  for (const [key, value] of Object.entries(team.equipes ?? {})) {
    groups.push([paymentLabels[key], metricValue(value, 'count')]);
  }
  target.append(reportTable(['Indicador', 'Resultado na parcela'], groups, 'Classificação e composição das equipes'));

  const amounts = Object.entries(team.valores).map(([key, value]) => [
    kind === 'esb' && key === 'qualidade' ? 'Qualidade · pagamento separado' : paymentLabels[key],
    metricValue(value, 'money'),
  ]);
  target.append(reportTable(['Rubrica', 'Valor'], amounts, 'Demonstrativo financeiro da equipe'));
  if (kind === 'esb') {
    target.append(el('p', 'O total de eSB 40 h corresponde ao relatório de custeio. A qualidade tem demonstrativo próprio.', 'quality-note'),
      reportTable(['Referência oficial por equipe', 'Valor'], Object.entries(team.referencias ?? {})
        .map(([key, value]) => [paymentLabels[key], metricValue(value, 'money')]), 'Referências financeiras da Saúde Bucal'));
  }
  const checks = team.validacao;
  target.append(el('h4', 'Validação e suspensões'));
  if (checks) {
    const rows = [['Equipes no detalhamento', checks.equipes], ['Equipes com suspensão indicada', checks.suspensas],
      ...Object.entries(checks.motivos).filter(([, value]) => value != null)
        .map(([key, value]) => [suspensionLabels[key], value])];
    target.append(reportTable(['Situação na fonte', 'Equipes'], rows.map(([label, value]) => [label, metricValue(value, 'count')]),
      'Suspensões agregadas por motivo'), el('p', 'Uma equipe pode ter mais de um motivo de suspensão.', 'quality-note'));
  } else {
    target.append(el('p', 'Validação de equipes indisponível para esta parcela.'));
  }
  const plans = el('details');
  plans.append(el('summary', 'Ver custeio por plano orçamentário'), metricChart('Custeio da parcela por plano orçamentário', financial, 'money'));
  target.append(plans);
}

export function renderProduction(target, {municipios, modalidades, dados}, {source, cutoff} = {}) {
  if (!dados.length) return;
  const filters = el('div', null, 'quality-controls');
  const results = el('div');
  results.setAttribute('aria-live', 'polite');
  const active = new Set(dados.map(row => row.modalidade));
  const cities = Object.entries(municipios);
  const periodLabel = value => value.split('-').reverse().join('/');
  const city = selectField(filters, 'Município da produção', cities, refresh);
  const period = selectField(filters, 'Competência da produção municipal', [], refresh);
  const metric = selectField(filters, 'Modalidade da produção', Object.entries(modalidades).filter(([key]) => active.has(key)), selectMetric);
  let periods;
  if (municipios['2700300']) city.value = '2700300';
  target.replaceChildren(filters,
    el('p', 'Volumes mensais publicados pelo Siaps. Cada modalidade é exibida separadamente. O traço indica valor indisponível.', 'quality-note'),
    results);
  selectMetric();

  function selectMetric() {
    const previousPeriod = period.value;
    periods = [...new Set(dados.filter(row => row.modalidade === metric.value).map(row => row.competencia))].sort().reverse();
    replaceOptions(period, periods.map(value => [value, periodLabel(value)]));
    period.value = periods.includes(previousPeriod) ? previousPeriod : periods[0];
    refresh();
  }

  function refresh() {
    const index = new Map(dados.filter(row => row.modalidade === metric.value)
      .map(row => [row.ibge + '/' + row.competencia, row.valor]));
    const reference = periodLabel(period.value);
    const compare = cities.map(([ibge, label]) => ({ibge, label, value: index.get(ibge + '/' + period.value)}));
    const year = period.value.slice(0, 4);
    const timeline = periods.filter(value => value.startsWith(year) && value <= period.value).reverse()
      .map(month => ({month, label: periodLabel(month), value: index.get(city.value + '/' + month)}));
    const color = palette[Object.keys(modalidades).indexOf(metric.value)];
    const figures = el('div', null, 'quality-figures');
    figures.append(metricChart(modalidades[metric.value] + ' por município · ' + reference, compare, 'count'),
      metricChart(municipios[city.value] + ' · Evolução até ' + reference,
        timeline.map(row => ({...row, color})), 'count'));
    const download = el('button', 'Baixar produção em CSV', 'chart-download');
    download.type = 'button';
    download.addEventListener('click', () => downloadCsv(
      'radar-producao-' + metric.value + '-' + city.value + '-' + period.value + '.csv',
      [['Recorte', 'IBGE', 'Município', 'Modalidade', 'Competência', 'Quantidade', 'Consulta em', 'Fonte'],
        ...compare.map(item => ['Comparação municipal', item.ibge, item.label, modalidades[metric.value], period.value, item.value, cutoff, source]),
        ...timeline.map(item => ['Série mensal', city.value, municipios[city.value], modalidades[metric.value], item.month, item.value, cutoff, source])]));
    results.replaceChildren(figures, download);
  }
}

export function renderSisabProduction(target, {municipios, modalidades, dados}, {source, cutoff} = {}) {
  if (!dados.length) return;
  const filters = el('div', null, 'quality-controls');
  const results = el('div');
  results.setAttribute('aria-live', 'polite');
  const city = selectField(filters, 'Município da produção SISAB', Object.entries(municipios), selectCity);
  const type = selectField(filters, 'Tipo de produção SISAB', [], selectType);
  const period = selectField(filters, 'Competência SISAB', [], selectMonth);
  const category = selectField(filters, 'Categoria profissional', [], refresh);
  const monthsLabel = value => value.split('-').reverse().join('/');
  const categories = rows => [...new Set(rows.map(row => row.categoria))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const guidance = el('p', null, 'quality-note');
  const submission = el('a', 'Validação de Produção e Envio no SISAB');
  submission.href = 'https://sisab.saude.gov.br/paginas/acessoRestrito/relatorio/federal/envio/RelValidacao.xhtml';
  guidance.append('Para conferir o processamento dos lotes enviados, use ', submission, '.');
  target.replaceChildren(filters,
    el('p', 'Produção publicada pelo SISAB por categoria profissional. As modalidades têm unidades próprias. O traço indica valor indisponível.', 'quality-note'),
    results, guidance);
  selectCity();

  function options(select, entries) {
    const previous = select.value;
    replaceOptions(select, entries);
    if (entries.some(([value]) => value === previous)) select.value = previous;
  }

  function cityRows() {
    return dados.filter(row => row.ibge === city.value);
  }

  function typeRows() {
    return cityRows().filter(row => row.modalidade === type.value);
  }

  function selectCity() {
    const available = new Set(cityRows().map(row => row.modalidade));
    options(type, Object.entries(modalidades).filter(([key]) => available.has(key)));
    selectType();
  }

  function selectType() {
    const months = [...new Set(typeRows().map(row => row.competencia))].sort().reverse();
    options(period, months.map(value => [value, monthsLabel(value)]));
    selectMonth();
  }

  function selectMonth() {
    const labels = categories(typeRows().filter(row => row.competencia === period.value));
    options(category, [['', 'Todas as categorias publicadas'], ...labels.map(value => [value, value])]);
    refresh();
  }

  function refresh() {
    const rows = typeRows().filter(row => !category.value || row.categoria === category.value);
    const snapshot = rows.filter(row => row.competencia === period.value)
      .sort((a, b) => (b.valor ?? -1) - (a.valor ?? -1) || a.categoria.localeCompare(b.categoria, 'pt-BR'));
    const figures = el('div', null, 'quality-figures');
    figures.append(metricChart(modalidades[type.value] + ' por categoria · ' + monthsLabel(period.value),
      snapshot.map(row => ({label: row.categoria, value: row.valor})), 'count'));
    const timeline = category.value ? rows.filter(row => row.competencia <= period.value)
      .sort((a, b) => a.competencia.localeCompare(b.competencia)) : [];
    if (timeline.length) {
      figures.append(metricChart('Evolução · ' + category.value,
        timeline.map(row => ({label: monthsLabel(row.competencia), value: row.valor, color: palette[0]})), 'count'));
    }
    const download = el('button', 'Baixar produção SISAB em CSV', 'chart-download');
    download.type = 'button';
    download.addEventListener('click', () => downloadCsv(
      'radar-sisab-' + city.value + '-' + type.value + '-' + period.value + '.csv',
      [['IBGE', 'Município', 'Competência', 'Tipo de produção', 'Categoria profissional', 'Quantidade', 'Consulta em', 'Fonte'],
        ...(timeline.length ? timeline : snapshot).map(row => [row.ibge, municipios[row.ibge], row.competencia,
          modalidades[row.modalidade], row.categoria, row.valor, cutoff, source])]));
    results.replaceChildren(figures, download);
  }
}

function svgElement(name, attributes = {}, text) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text != null) node.textContent = text;
  return node;
}

function weeklyCurve(label, values, lastWeek, color) {
  const figure = el('figure', null, 'metric-chart weekly-curve');
  figure.append(el('figcaption', label));
  if (!values.length) {
    figure.append(el('p', 'Série semanal indisponível neste recorte.'));
    return figure;
  }
  const peak = Math.max(...values);
  const peakLabel = metricValue(peak, 'count') + (peak === 1 ? ' notificação' : ' notificações');
  const high = Math.max(1, peak);
  const x = index => 42 + 264 * index / Math.max(lastWeek - 1, 1);
  const y = value => 96 - 80 * value / high;
  const plot = svgElement('svg', {viewBox: '0 0 320 122', role: 'img',
    'aria-label': label + ', pico de ' + peakLabel});
  for (const value of [0, high]) {
    plot.append(svgElement('line', {x1: x(0), x2: x(lastWeek - 1), y1: y(value), y2: y(value), class: 'weekly-gridline'}),
      svgElement('text', {x: 39, y: y(value) + 4, 'text-anchor': 'end'}, metricValue(value, 'count')));
  }
  const ticks = [1, 13, 26, 39].filter(week => week < lastWeek - 4).concat(lastWeek);
  if (lastWeek > 1 && ticks[0] !== 1) ticks.unshift(1);
  for (const week of ticks) {
    plot.append(svgElement('text', {x: x(week - 1), y: 114, 'text-anchor': 'middle'}, week));
  }
  const points = values.map((value, index) => [x(index), y(value)].join(',')).join(' ');
  plot.append(values.length === 1
    ? svgElement('circle', {cx: x(0), cy: y(values[0]), r: 3, fill: color})
    : svgElement('polyline', {points, stroke: color, class: 'weekly-line'}));
  figure.append(plot, el('p', 'SE 01–' + String(values.length).padStart(2, '0') +
    ' · Pico de ' + peakLabel, 'quality-note'));
  return figure;
}

function weeklySection(chosenYear, entries, chosen, colors, city, cityLabel, source) {
  const section = el('section', null, 'epidemiology-weekly');
  section.append(el('h3', 'Notificações por semana epidemiológica · ' + chosenYear));
  const series = entries.map(([key, info]) => {
    const record = chosen.get(key);
    return {label: info.label, record, values: record?.semanas ?? [], color: colors.get(key)};
  });
  const lastWeek = Math.max(...series.map(item => item.values.length));
  if (!lastWeek) {
    section.append(el('p', 'Séries semanais indisponíveis para este município e ano.'));
    return section;
  }
  section.append(el('p', 'O eixo horizontal mostra a semana dos primeiros sintomas. Cada gráfico tem sua própria escala. A prévia parcial termina na última semana com registros no arquivo nacional.', 'quality-note'));
  const charts = el('div', null, 'weekly-charts');
  for (const item of series) charts.append(weeklyCurve(item.label, item.values, lastWeek, item.color));
  const detail = el('details');
  detail.append(el('summary', 'Consultar valores por semana epidemiológica'));
  const box = el('div', null, 'quality-table');
  box.tabIndex = 0;
  box.setAttribute('role', 'region');
  box.setAttribute('aria-label', 'Notificações por semana epidemiológica');
  const table = el('table');
  const head = table.createTHead().insertRow();
  for (const label of ['Semana', ...series.map(item => item.label)]) {
    const th = el('th', label);
    th.scope = 'col';
    head.append(th);
  }
  const body = table.createTBody();
  for (let index = 0; index < lastWeek; index++) {
    const row = body.insertRow();
    const th = el('th', 'SE ' + String(index + 1).padStart(2, '0'));
    th.scope = 'row';
    row.append(th, ...series.map(item => el('td', metricValue(item.values[index], 'count'))));
  }
  box.append(table);
  detail.append(box);
  const download = el('button', 'Baixar arboviroses semanais em CSV', 'chart-download');
  download.type = 'button';
  download.addEventListener('click', () => downloadCsv('radar-arboviroses-semanal-' + city + '-' + chosenYear + '.csv',
    [['IBGE', 'Município', 'Ano epidemiológico', 'Semana epidemiológica', 'Agravo', 'Notificações',
      'Cobertura da semana', 'Situação do arquivo', 'Arquivo SINAN', 'Atualização do arquivo', 'Fonte'],
    ...Array.from({length: lastWeek}, (_, index) => series.map(item => [city, cityLabel, chosenYear, index + 1,
      item.label, item.values[index], index < item.values.length ? 'Disponível' : 'Indisponível',
      item.record?.situacao, item.record?.arquivo, item.record?.arquivo_atualizado, source])).flat()]));
  section.append(charts, detail, download);
  return section;
}

export function renderEpidemiology(target, {municipios, agravos, dados}, source) {
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
    results.replaceChildren(figures);
    if (group.value === 'arboviroses') results.append(weeklySection(chosenYear, entries, chosen, colors, city.value, municipios[city.value], source));
    results.append(yearTable(chosen, measure));
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
