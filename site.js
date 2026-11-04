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

function renderSnapshot({version, updated, ibge, series, sources}) {
  const panels = document.getElementById('panels');
  document.getElementById('version').textContent = '· v' + version;
  document.getElementById('stamp').textContent = 'IBGE ' + ibge + ' · Publicado em ' + date(updated);

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
    const missing = ['C', 'B', 'M'].filter(group => !data.includes(group));
    const block = metric(data.join(' e ') || '—', 'Grupos com resultados carregados · ' + date(period));
    if (missing.length) block.append(el('p', 'Grupos sem resultados carregados nesta referência · ' + missing.join(', '), 'detail'));
    return block;
  });

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

fetch('./dados.json')
  .then(response => {
    if (!response.ok) throw new Error('Dados indisponíveis');
    return response.json();
  })
  .then(snapshot => {
    renderSnapshot(snapshot);
    document.getElementById('status').hidden = true;
  })
  .catch(() => {
    document.getElementById('status').textContent = 'Os dados do piloto estão temporariamente indisponíveis. Recarregue a página para tentar novamente.';
  });
