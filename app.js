// app.js — upload + orchestration
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const errorEl = document.getElementById('error');
const resultsEl = document.getElementById('results');

fileInput.addEventListener('change', e => e.target.files[0] && handleFile(e.target.files[0]));

['dragenter', 'dragover'].forEach(ev =>
  dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add('drag'); }));
['dragleave', 'drop'].forEach(ev =>
  dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove('drag'); }));
dropzone.addEventListener('drop', e => e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0]));

function handleFile(file) {
  errorEl.hidden = true;
  if (!file.name.toLowerCase().endsWith('.csv')) return showError('Please choose a .csv file.');

  Papa.parse(file, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    complete: result => {
      if (!result.data.length) return showError('The CSV has no data rows.');
      const analysis = Stats.analyze(result.data);
      document.getElementById('dropText').textContent = `Loaded: ${file.name} (click to change)`;
      renderCards(analysis);
      renderPreview(result.data);
      resultsEl.hidden = false;
      console.log(analysis); // check the full analysis in the browser console (F12)
    },
    error: err => showError('Could not read file: ' + err.message),
  });
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
  resultsEl.hidden = true;
}

function renderCards(a) {
  const items = [
    [a.rowCount.toLocaleString(), 'Rows'],
    [a.colCount, 'Columns'],
    [a.totalMissing.toLocaleString(), 'Missing values'],
    [a.duplicateRows.toLocaleString(), 'Duplicate rows'],
  ];
  document.getElementById('cards').innerHTML = items
    .map(([num, label]) => `<div class="card"><div class="num">${num}</div><div class="label">${label}</div></div>`)
    .join('');
}

function escapeHTML(v) {
  return String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function renderPreview(rows) {
  const cols = Object.keys(rows[0]);
  const head = `<tr>${cols.map(c => `<th>${escapeHTML(c)}</th>`).join('')}</tr>`;
  const body = rows.slice(0, 20)
    .map(r => `<tr>${cols.map(c => `<td>${escapeHTML(r[c])}</td>`).join('')}</tr>`)
    .join('');
  document.getElementById('preview').innerHTML = head + body;
}
