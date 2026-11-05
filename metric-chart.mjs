const palette = ['#245c9b', '#14694e', '#845099', '#a55720', '#28777d', '#aa4058'];
const percentage = new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 2});
const currency = new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'});
const compactMoney = new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1});

export function metricValue(value, unit) {
  if (value == null) return '—';
  return unit === 'money' ? currency.format(value / 100) : percentage.format(value) + '%';
}

export function metricChart(title, rows, unit) {
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
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
  rows.forEach(({label, value}, index) => {
    const row = el('div', null, 'metric-row');
    const track = el('div', null, 'metric-track');
    track.setAttribute('aria-hidden', 'true');
    if (value == null) track.classList.add('metric-unavailable');
    if (value) {
      const bar = el('span', null, 'metric-bar');
      bar.style.backgroundColor = palette[index % palette.length];
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
