import {renderQualityCharts, renderVinculo} from './quality-charts.mjs?v=a6a152df1b2a';
import {downloadCsv, metricChart, metricValue, renderApsPayments, renderApsQualityReference, renderEpidemiology, renderMunicipalNetwork, renderProduction, renderSisabProduction} from './metric-chart.mjs?v=731c2719ffcf';

const number = new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 2});
const money = new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'});
const display = (value, suffix = '') => value == null ? '—' : number.format(value) + suffix;
const reais = cents => cents == null ? '—' : money.format(cents / 100);
const date = value => value.split('-').reverse().join('/');

function el(tag, text, className) {
  const element = document.createElement(tag);
  if (text != null) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function selector(parent, labelText, options, render) {
  const label = el('label', labelText);
  const select = el('select');
  for (const [value, labelText] of options) {
    const option = el('option', labelText);
    option.value = value;
    select.append(option);
  }
  label.append(select);
  parent.append(label);
  if (render) select.addEventListener('change', () => render(select.value));
  return select;
}

function table(headers, rows) {
  const element = el('table');
  const heading = element.createTHead().insertRow();
  for (const header of headers) {
    const cell = el('th', header);
    cell.scope = 'col';
    heading.append(cell);
  }
  const body = element.createTBody();
  for (const [label, ...values] of rows) {
    const row = body.insertRow();
    const cell = el('th', label);
    cell.scope = 'row';
    row.append(cell, ...values.map(value => el('td', value)));
  }
  return element;
}

function metric(value, detail) {
  const block = el('div');
  block.append(el('p', value, 'value'), el('p', detail, 'detail'));
  return block;
}

function renderComparison(dataset) {
  const target = document.getElementById('comparison');
  if (!dataset) {
    target.append(el('p', 'Comparativo indisponível nesta edição.'));
    return;
  }
  const {municipios, indicadores, dados} = dataset;
  const controls = el('div', null, 'columns');
  const dates = el('div');
  const result = el('div');
  result.setAttribute('aria-live', 'polite');
  const article = el('article', null, 'panel');
  article.append(controls, result);
  target.append(article);

  function showMetric(key) {
    const definition = indicadores[key];
    const records = dados.filter(row => row.indicador === key);
    const periods = [...new Set(records.map(row => row.competencia))].sort().reverse();
    const format = definition.unit === 'money' ? reais : value => display(value, definition.unit === 'percent' ? '%' : '');
    const showPeriod = period => {
      const rows = records.filter(row => row.competencia === period);
      const values = new Map(rows.map(row => [row.ibge, row.valor]));
      const link = el('a', definition.source);
      link.href = definition.url;
      const cutoff = rows[0]?.corte;
      const note = el('p', null, 'source');
      note.append(link, ' · Referência ' + date(period));
      if (cutoff) note.append(' · Data de corte ou publicação ' + date(cutoff));
      result.replaceChildren(table(['Município', 'Valor'], Object.entries(municipios).map(([ibge, label]) =>
        [label, format(values.get(ibge))])), note, el('p', 'O traço indica valor indisponível.', 'detail'));
      if (key === 'fns_aps_por_habitante') {
        result.append(el('p', 'Repasse acumulado da edição dividido pela estimativa IBGE de 1º de julho do mesmo ano.', 'detail'));
      }
      if (definition.unit === 'percent') {
        result.append(el('p', 'O ano do corte é parcial. Percentuais acima de 100% seguem a fonte publicada.', 'detail'));
      }
    };
    dates.replaceChildren();
    selector(dates, 'Competência comparada', periods.map(period => [period, date(period)]), showPeriod);
    showPeriod(periods[0]);
  }

  const active = new Set(dados.map(row => row.indicador));
  const options = Object.entries(indicadores).filter(([key]) => active.has(key)).map(([key, item]) => [key, item.label]);
  selector(controls, 'Indicador municipal', options, showMetric);
  controls.append(dates);
  showMetric(options[0][0]);
}

function renderPse(parent, cities) {
  if (!cities.length) {
    parent.append(el('p', 'Referência indisponível nesta publicação.'));
    return;
  }
  const detail = el('div');
  detail.setAttribute('aria-live', 'polite');
  function show(cityCode) {
    const {pse} = cities.find(city => city.ibge === cityCode);
    detail.replaceChildren(metric(display(pse.schools) + ' escolas pactuadas',
      display(pse.students) + ' estudantes · Ciclo ' + pse.cycle));
    if (!pse.window) {
      detail.append(el('p', 'Apuração I1 e I2 indisponível para este recorte.', 'detail'));
      return;
    }
    const indicators = el('div', null, 'columns');
    indicators.append(metric(display(pse.i1, '%'), 'I1 · Escolas com ações elegíveis · ' + pse.i1_schools + ' de ' + pse.schools),
      metric(display(pse.i2, '%'), 'I2 · Escolas com as cinco prioridades · ' + pse.i2_schools + ' de ' + pse.schools));
    const schools = el('details');
    const scroll = el('div', null, 'pse-schools');
    scroll.tabIndex = 0;
    scroll.setAttribute('role', 'region');
    scroll.setAttribute('aria-label', 'Resultado do PSE por escola');
    scroll.append(table(['Escola', 'INEP', 'I1', 'I2', 'Prioridades sem registro'],
      pse.details.map(([inep, name, i1, i2, missing]) => [name, inep, i1 ? 'Sim' : '—', i2 ? 'Sim' : '—', missing.join(', ') || '—'])));
    schools.append(el('summary', 'Conferir execução por escola'), scroll);
    detail.append(indicators, metricChart('Execução do PSE em percentual das escolas pactuadas', [
      {label:'I1 · Com ação elegível', value:pse.i1},
      {label:'I2 · Com as cinco prioridades', value:pse.i2},
    ], 'percent'), el('p', 'Apuração local de ' + pse.window.map(date).join(' a '), 'detail'), schools);
  }
  const filters = el('div', null, 'columns');
  selector(filters, 'Município do PSE', cities.map(city => [city.ibge, city.label]), show);
  const period = cities.find(city => city.pse.window)?.pse.window.map(date).join(' a ') ?? cities[0].pse.cycle;
  selector(filters, 'Período do PSE', [[period, period]]);
  parent.append(filters, detail);
  show(cities[0].ibge);
}

function renderVaccination(parent, cities) {
  if (!cities.length) {
    parent.append(el('p', 'Referência indisponível nesta publicação.'));
    return;
  }
  const filters = el('div', null, 'columns');
  const dates = el('div');
  const detail = el('div');
  detail.setAttribute('aria-live', 'polite');
  let selectedYear;
  function showCity(ibge) {
    const {rows, cutoff} = cities.find(city => city.ibge === ibge);
    const years = [...new Set(rows.map(row => String(row.ano)))].sort().reverse();
    function showYear(year) {
      selectedYear = year;
      const visible = rows.filter(row => String(row.ano) === year);
      const note = year === cutoff?.slice(0, 4)
        ? 'Ano parcial, com corte em ' + date(cutoff) + '.'
        : 'Cobertura anual conforme a publicação.';
      const values = visible.map(row => ({label:row.imunobiologico, value:row.cobertura}));
      const exact = el('details');
      exact.append(el('summary', 'Ver coberturas exatas'),
        table(['Imunobiológico', 'Cobertura'], values.map(row => [row.label, metricValue(row.value, 'percent')])));
      detail.replaceChildren(el('p', note + ' Percentuais acima de 100% seguem a fonte.', 'detail'),
        metricChart('Cobertura vacinal por imunobiológico', values, 'percent'), exact);
    }
    dates.replaceChildren();
    const year = selector(dates, 'Ano da vacinação', years.map(value => [value, value]), showYear);
    year.value = years.includes(selectedYear) ? selectedYear : years[0];
    showYear(year.value);
  }
  selector(filters, 'Município da vacinação', cities.map(city => [city.ibge, city.label]), showCity);
  filters.append(dates);
  parent.append(filters, detail);
  showCity(cities[0].ibge);
}

function renderSnapshot({version, updated, ibge, municipality, series, sources, deliveries, comparison, pseRegional}) {
  const modules = {
    ibge: 'dados', cnes: 'rede', rede_municipal: 'rede', equipes_cnes: 'rede',
    fns: 'financiamento', pagamento_aps: 'financiamento', qualidade: 'indicadores',
    siaps_vinculo: 'indicadores', siaps: 'producao', siaps_producao: 'producao',
    sisab_producao: 'producao', epidemiologia: 'vigilancia',
  };
  clearSnapshot();
  document.getElementById('version').textContent = '· v' + version;
  document.getElementById('stamp').textContent = 'IBGE ' + ibge + ' · Publicado em ' + date(updated);
  const milestones = document.getElementById('deliveries');
  for (const {status, title, description} of deliveries) {
    const item = el('article');
    item.append(el('span', status, status === 'Aguardando fonte' ? 'tag pending' : 'tag'),
      el('h3', title), el('p', description));
    milestones.append(item);
  }
  renderComparison(comparison);

  function card(module, title, links, wide = false) {
    const article = el('article', null, wide ? 'panel wide' : 'panel');
    const body = el('div');
    const source = el('p', 'Fonte · ', 'source');
    for (const [index, [label, url]] of links.entries()) {
      if (index) source.append(' · ');
      const link = el('a', label);
      link.href = url;
      source.append(link);
    }
    article.append(el('h3', title), body);
    if (links.length) article.append(source);
    document.querySelector('#' + module + ' [data-cards]').append(article);
    return body;
  }

  function editions(source, title, link, label, render, wide = false, format = date) {
    const body = card(modules[source], title, [[link, sources[source]]], wide);
    const records = series[source];
    if (!records.length) {
      body.append(el('p', 'Referência indisponível nesta publicação.'));
      return;
    }
    const detail = el('div');
    detail.setAttribute('aria-live', 'polite');
    const show = value => detail.replaceChildren(render(records.find(item => item.period === value)));
    if (records.length > 1) {
      selector(body, label, records.map(item => [item.period, format(item.period)]), show);
    }
    body.append(detail);
    show(records[0].period);
  }

  editions('ibge', 'População residente', 'IBGE · SIDRA 6579', 'Referência da população', ({data, cutoff}) =>
    metric(display(data.population) + ' habitantes', 'Estimativa em ' + date(cutoff)));
  editions('cnes', 'Cadastro geral de estabelecimentos', 'CNES · API do Ministério da Saúde', 'Mês da consulta', ({data, period}) =>
    metric(display(data.establishments) + ' estabelecimentos',
      display(data.ambulatory) + ' com atendimento ambulatorial SUS indicado no cadastro · Consulta em ' + date(period)));
  editions('rede_municipal', 'Rede pública municipal por tipo', 'CNES · DATASUS', 'Competência da rede pública', ({data, period}) => {
    const body = el('div');
    const chart = el('div');
    body.append(el('p', 'Competência CNES · ' + date(period), 'detail'), chart);
    renderMunicipalNetwork(chart, data);
    return body;
  }, true);
  editions('equipes_cnes', 'Equipes cadastradas', 'DATASUS · Arquivo EP do CNES', 'Competência das equipes', ({data}) => {
    const block = metric(display(data.total) + ' equipes', 'Registros municipais do arquivo EP');
    const types = Object.entries(data.types).sort((a, b) => b[1] - a[1]);
    block.append(table(['Tipo de equipe', 'Equipes'], types.map(([label, count]) => [label, display(count)])));
    return block;
  });
  let financeCity;
  editions('fns', 'Financiamento federal', 'Fundo Nacional de Saúde', 'Edição do FNS', ({data: cities, cutoff}) => {
    const block = el('div');
    const detail = el('div');
    detail.setAttribute('aria-live', 'polite');
    function showCity(ibge) {
      financeCity = ibge;
      const {data} = cities.find(city => city.ibge === ibge);
      const rows = [{label:'Atenção Primária', value:data.aps_liquido_centavos},
        {label:'Total de todos os grupos', value:data.total_liquido_centavos}];
      detail.replaceChildren(el('p', 'Acumulado até ' + date(cutoff) + '. O total já inclui a Atenção Primária.', 'detail'),
        metricChart('Repasses líquidos da edição em reais', rows, 'money'),
        table(['Grupo', 'Líquido'], rows.map(row => [row.label, metricValue(row.value, 'money')])));
      if (data.grupos?.length) {
        const exact = el('details');
        const amounts = el('div', null, 'quality-table');
        amounts.tabIndex = 0;
        amounts.setAttribute('role', 'region');
        amounts.setAttribute('aria-label', 'Valores por bloco e grupo');
        amounts.append(table(['Bloco', 'Grupo', 'Bruto', 'Líquido'], data.grupos.map(row => [row.bloco, row.grupo,
          metricValue(row.bruto_centavos, 'money'), metricValue(row.liquido_centavos, 'money')])));
        exact.append(el('summary', 'Conferir repasses por bloco e grupo'), amounts);
        detail.append(metricChart('Repasse líquido por bloco e grupo', data.grupos.map(row => ({
          label: row.bloco + ' · ' + row.grupo, value: row.liquido_centavos,
        })), 'money'), exact);
      }
    }
    const select = selector(block, 'Município do financiamento', cities.map(city => [city.ibge, city.label]), showCity);
    select.value = cities.some(city => city.ibge === financeCity) ? financeCity : cities[0].ibge;
    const comparison = el('details');
    const scroll = el('div', null, 'quality-table');
    scroll.tabIndex = 0;
    scroll.setAttribute('role', 'region');
    scroll.setAttribute('aria-label', 'Repasses dos municípios na mesma edição');
    scroll.append(table(['Município', 'Atenção Primária', 'Total de todos os grupos'], cities.map(city => [
      city.label, reais(city.data.aps_liquido_centavos), reais(city.data.total_liquido_centavos),
    ])));
    comparison.append(el('summary', 'Comparar repasses entre municípios'), scroll);
    block.append(detail, comparison);
    showCity(select.value);
    return block;
  }, true);
  editions('pagamento_aps', 'Pagamento e credenciamento da APS', 'e-Gestor APS · Relatórios públicos', 'Revisão do pagamento APS', ({data}) => {
    const body = el('div');
    renderApsPayments(body, data);
    return body;
  }, true);

  renderApsQualityReference(card('financiamento', 'Referência do componente de qualidade', [], true));

  const school = card('pse', 'Programa Saúde na Escola', [
    ['Portaria de adesão', sources.pse], ['Escolas no e-Gestor', sources.pse_escolas],
    ['Ações validadas no SISAB', sources.pse_acoes], ['Nota Técnica nº 7/2026', sources.pse_rule],
  ], true);
  renderPse(school, [...(series.pse ? [{ibge, label: municipality, pse:series.pse}] : []), ...(pseRegional ?? [])]);

  const qualitySelection = {};
  editions('qualidade', 'Qualidade da Atenção Primária', 'Siaps · Área pública', 'Quadrimestre de referência', ({data, preliminary, generated}) => {
    const block = el('div');
    if (preliminary) block.append(el('p', 'Dados preliminares do Siaps', 'tag pending'));
    if (generated) block.append(el('p', 'Relatório gerado em ' + generated, 'detail'));
    const charts = el('div');
    block.append(charts);
    renderQualityCharts(charts, data, undefined, qualitySelection);
    return block;
  }, true, period => (Number(period.slice(5)) / 4) + 'º quadrimestre de ' + period.slice(0, 4));

  if (series.siaps_vinculo?.length) editions('siaps_vinculo', 'Vínculo e acompanhamento territorial · Siaps', 'Siaps · Cofinanciamento da APS', 'Revisão do vínculo territorial', ({data, cutoff}) => {
    const body = el('div');
    const charts = el('div');
    if (cutoff) body.append(el('p', 'Consultado em ' + date(cutoff), 'detail'));
    body.append(charts);
    renderVinculo(charts, data, {downloadCsv, cutoff, source: sources.siaps_vinculo});
    return body;
  }, true);

  editions('siaps', 'Produção assistencial da APS', 'Siaps · Práticas assistenciais', 'Competência da produção', ({data}) =>
    table(['Indicador e categoria', 'Valor publicado'],
      data.map(([indicator, category, value]) => [[indicator, category].join(' · '), display(value)])));

  if (series.siaps_producao?.length) editions('siaps_producao', 'Produção mensal da APS · Siaps', 'Siaps · Práticas assistenciais', 'Revisão da produção municipal', ({data, cutoff}) => {
    const body = el('div');
    const charts = el('div');
    if (cutoff) body.append(el('p', 'Consultado em ' + date(cutoff), 'detail'));
    body.append(charts);
    renderProduction(charts, data, {cutoff, source: sources.siaps_producao});
    return body;
  }, true);

  if (series.sisab_producao?.length) editions('sisab_producao', 'Produção por categoria profissional · SISAB', 'SISAB · Relatório de Produção', 'Revisão da produção SISAB', ({data, cutoff}) => {
    const body = el('div');
    const charts = el('div');
    if (cutoff) body.append(el('p', 'Consultado em ' + date(cutoff), 'detail'));
    body.append(charts);
    renderSisabProduction(charts, data, {cutoff, source: sources.sisab_producao});
    return body;
  }, true);

  editions('epidemiologia', 'Epidemiologia · SINAN', 'DATASUS · Arquivos do SINAN', 'Revisão do lote', ({data}) => {
    const body = el('div');
    renderEpidemiology(body, data, sources.epidemiologia);
    return body;
  }, true);

  const vaccine = card('vigilancia', 'Cobertura vacinal', [['Painel CONASEMS · RNDS', sources.vacinacao]], true);
  renderVaccination(vaccine, series.vacinacao[0]?.data ?? []);
}

const login = document.getElementById('login');
const loginError = document.getElementById('login-error');
const preview = document.getElementById('preview');
const access = document.getElementById('access');
const navigation = document.getElementById('navigation');
const menuToggle = document.getElementById('module-toggle');
const logout = document.getElementById('logout');
const modules = [...document.querySelectorAll('.dashboard-module')];
const username = document.getElementById('username');
const password = document.getElementById('password');
const submit = login.querySelector('button[type=submit]');
const decode = value => Uint8Array.from(atob(value), character => character.charCodeAt(0));

function clearSnapshot() {
  for (const node of preview.querySelectorAll('[data-cards], #comparison, #deliveries, #version, #stamp')) {
    node.replaceChildren();
  }
}

function showModule(focus) {
  if (preview.hidden) return;
  const selected = modules.find(module => '#' + module.id === location.hash) ?? modules[0];
  for (const module of modules) module.hidden = module !== selected;
  for (const link of navigation.querySelectorAll('a')) {
    if (link.hash === '#' + selected.id) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  menuToggle.setAttribute('aria-expanded', 'false');
  if (focus) selected.querySelector('h2').focus();
}

navigation.addEventListener('click', event => {
  const link = event.target.closest('a');
  if (!link || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (location.hash !== link.hash) history.pushState(null, '', link.hash);
  showModule(true);
});

window.addEventListener('hashchange', () => showModule(true));
menuToggle.addEventListener('click', () => {
  menuToggle.setAttribute('aria-expanded', String(menuToggle.getAttribute('aria-expanded') === 'false'));
});

async function unlock(bundle, credentials) {
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(credentials), 'PBKDF2', false, ['deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    {name:'PBKDF2', hash:'SHA-256', salt:decode(bundle.salt), iterations:bundle.rounds},
    base, {name:'AES-GCM', length:256}, false, ['decrypt'],
  );
  const clear = await crypto.subtle.decrypt({name:'AES-GCM', iv:decode(bundle.nonce)}, key, decode(bundle.data));
  return JSON.parse(new TextDecoder().decode(clear));
}

login.addEventListener('submit', async event => {
  event.preventDefault();
  if (submit.disabled) return;
  submit.disabled = true;
  loginError.textContent = '';
  const credentials = JSON.stringify([username.value.trim(), password.value]);
  password.value = '';
  try {
    const response = await fetch('./previa.json', {cache:'no-store'});
    if (!response.ok) throw new Error();
    const bundle = await response.json();
    if (bundle.version !== 1 || bundle.rounds !== 600000) throw new Error();
    let snapshot;
    try {
      snapshot = await unlock(bundle, credentials);
    } catch {
      loginError.textContent = 'Usuário ou senha inválidos.';
      password.focus();
      return;
    }
    renderSnapshot(snapshot);
    access.hidden = true;
    preview.hidden = false;
    logout.hidden = false;
    showModule(Boolean(location.hash));
    if (!location.hash) preview.querySelector('h1').focus();
  } catch {
    loginError.textContent = 'A prévia está indisponível. Tente novamente em instantes.';
  } finally {
    submit.disabled = false;
  }
});

logout.addEventListener('click', () => {
  preview.hidden = true;
  logout.hidden = true;
  clearSnapshot();
  access.hidden = false;
  login.reset();
  username.focus();
});
