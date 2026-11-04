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
  select.addEventListener('change', () => render(select.value));
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
  for (const [label, value] of rows) {
    const row = body.insertRow();
    const cell = el('th', label);
    cell.scope = 'row';
    row.append(cell, el('td', value));
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

function renderSnapshot({version, updated, ibge, series, sources, deliveries, comparison}) {
  const panels = document.getElementById('panels');
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

  function card(title, links, wide = false) {
    const article = el('article', null, wide ? 'panel wide' : 'panel');
    const body = el('div');
    const source = el('p', 'Fonte · ', 'source');
    for (const [index, [label, url]] of links.entries()) {
      if (index) source.append(' · ');
      const link = el('a', label);
      link.href = url;
      source.append(link);
    }
    article.append(el('h3', title), body, source);
    panels.append(article);
    return body;
  }

  function editions(source, title, link, label, render) {
    const body = card(title, [[link, sources[source]]]);
    const records = series[source];
    if (!records.length) {
      body.append(el('p', 'Referência indisponível nesta publicação.'));
      return;
    }
    const detail = el('div');
    detail.setAttribute('aria-live', 'polite');
    const show = value => detail.replaceChildren(render(records.find(item => item.period === value)));
    if (records.length > 1) {
      selector(body, label, records.map(item => [item.period, date(item.period)]), show);
    }
    body.append(detail);
    show(records[0].period);
  }

  editions('ibge', 'População residente', 'IBGE · SIDRA 6579', 'Referência da população', ({data, cutoff}) =>
    metric(display(data.population) + ' habitantes', 'Estimativa em ' + date(cutoff)));
  editions('cnes', 'Estabelecimentos de saúde', 'CNES · API do Ministério da Saúde', 'Mês da consulta', ({data, period}) =>
    metric(display(data.establishments) + ' estabelecimentos',
      display(data.ambulatory) + ' com atendimento ambulatorial SUS indicado no cadastro · Consulta em ' + date(period)));
  editions('equipes_cnes', 'Equipes cadastradas', 'DATASUS · Arquivo EP do CNES', 'Competência das equipes', ({data}) => {
    const block = metric(display(data.total) + ' equipes', 'Registros municipais do arquivo EP');
    const types = Object.entries(data.types).sort((a, b) => b[1] - a[1]);
    block.append(table(['Tipo de equipe', 'Equipes'], types.map(([label, count]) => [label, display(count)])));
    return block;
  });
  editions('fns', 'Financiamento federal', 'Fundo Nacional de Saúde', 'Edição do FNS', ({data, cutoff}) => {
    const block = metric(reais(data.aps), 'Repasses líquidos do grupo Atenção Primária');
    block.append(metric(reais(data.total), 'Total líquido de todos os grupos · Acumulado até ' + date(cutoff)));
    return block;
  });

  const pse = series.pse;
  const school = card('Programa Saúde na Escola', [
    ['Pactuação', sources.pse], ['Ações validadas', sources.pse_acoes],
  ]);
  if (pse) {
    school.append(metric(display(pse.schools) + ' escolas pactuadas',
      display(pse.students) + ' estudantes · Ciclo ' + pse.cycle));
    if (pse.window) {
      const indicators = el('div', null, 'columns');
      indicators.append(metric(display(pse.i1, '%'), 'I1 · Escolas com ações elegíveis'),
        metric(display(pse.i2, '%'), 'I2 · Escolas com as cinco prioridades'));
      school.append(indicators, el('p', 'Apuração local de ' + pse.window.map(date).join(' a '), 'detail'));
    }
  } else school.append(el('p', 'Referência indisponível nesta publicação.'));

  editions('qualidade', 'Qualidade da Atenção Primária', 'Siaps · Área pública', 'Quadrimestre de referência', ({data, period}) => {
    const groups = [...new Set(data.map(([, indicator]) => indicator[0]))].sort();
    const missing = ['C', 'B', 'M'].filter(group => !groups.includes(group));
    const block = metric(groups.join(' e ') || '—', 'Grupos com resultados carregados · ' + date(period));
    if (missing.length) block.append(el('p', 'Grupos sem resultados carregados nesta referência · ' + missing.join(', '), 'detail'));
    const details = el('details');
    details.append(el('summary', 'Conferir equipes por indicador e conceito'));
    details.append(table(['Indicador, equipe e conceito', 'Equipes'],
      data.map(([team, indicator, name, concept, total]) =>
        [[indicator, name, team, concept].filter(Boolean).join(' · '), display(total)])));
    block.append(details);
    return block;
  });

  editions('siaps', 'Produção assistencial da APS', 'Siaps · Práticas assistenciais', 'Competência da produção', ({data}) =>
    table(['Indicador e categoria', 'Valor publicado'],
      data.map(([indicator, category, value]) => [[indicator, category].join(' · '), display(value)])));

  const vaccine = card('Cobertura vacinal', [['Painel CONASEMS · RNDS', sources.vacinacao]], true);
  const edition = series.vacinacao[0];
  if (!edition) {
    vaccine.append(el('p', 'Referência indisponível nesta publicação.'));
    return;
  }
  const years = [...new Set(edition.data.map(row => row[0]))].sort((a, b) => b - a);
  const detail = el('div');
  function showVaccine(year) {
    const rows = edition.data.filter(row => row[0] === Number(year));
    const note = year === edition.cutoff.slice(0, 4)
      ? 'Ano parcial, com corte em ' + date(edition.cutoff) + '.'
      : 'Cobertura anual conforme a publicação.';
    detail.replaceChildren(el('p', note, 'detail'),
      table(['Imunobiológico', 'Cobertura'], rows.map(([, label, value]) => [label, display(value, '%')])));
  }
  selector(vaccine, 'Ano da vacinação', years.map(year => [String(year), String(year)]), showVaccine);
  vaccine.append(detail);
  showVaccine(String(years[0]));
}

const login = document.getElementById('login');
const loginError = document.getElementById('login-error');
const preview = document.getElementById('preview');
const access = document.getElementById('access');
const navigation = document.getElementById('navigation');
const username = document.getElementById('username');
const password = document.getElementById('password');
const submit = login.querySelector('button[type=submit]');
const decode = value => Uint8Array.from(atob(value), character => character.charCodeAt(0));

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
    navigation.hidden = false;
    preview.querySelector('h1').focus();
  } catch {
    loginError.textContent = 'A prévia está indisponível. Tente novamente em instantes.';
  } finally {
    submit.disabled = false;
  }
});

document.getElementById('logout').addEventListener('click', () => {
  preview.hidden = true;
  navigation.hidden = true;
  for (const id of ['panels', 'comparison', 'deliveries', 'version', 'stamp']) {
    document.getElementById(id).replaceChildren();
  }
  access.hidden = false;
  login.reset();
  username.focus();
});
