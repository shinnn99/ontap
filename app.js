// Read and render questions from CSV with chapter filter and instant answer reveal

async function loadCSV() {
  const res = await fetch('./dap_an.csv');
  if (!res.ok) throw new Error('Không thể đọc file dap_an.csv');
  const text = await res.text();
  return text;
}

function parseCSV(text) {
  // Remove BOM and normalize newlines
  let s = text.replace(/^\uFEFF/, '').replace(/\r/g, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        const next = s[i + 1];
        if (next === '"') { // escaped quote
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }
  // push last field/row if any
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map(h => h.trim());
  const dataRows = rows.slice(1);
  return dataRows.map((r) => {
    const obj = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = (r[i] ?? '').trim();
    }
    return obj;
  });
}

function distinctChapters(items) {
  const set = new Set(items.map(x => x['Chương']).filter(Boolean));
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
}

function renderChapterOptions(chapters) {
  const select = document.getElementById('chapterSelect');
  // Clear existing except first
  while (select.options.length > 1) select.remove(1);
  chapters.forEach(ch => {
    const opt = document.createElement('option');
    opt.value = ch;
    opt.textContent = ch;
    select.appendChild(opt);
  });
}

function buildQuestionCard(item, idx) {
  const card = document.createElement('div');
  card.className = 'question-card';
  card.dataset.index = String(idx);

  const header = document.createElement('div');
  header.className = 'question-header';
  const number = document.createElement('div');
  number.className = 'question-number';
  number.textContent = `Câu ${item['Câu số']}`;
  const text = document.createElement('div');
  text.className = 'question-text';
  text.textContent = item['Nội dung Câu hỏi'];
  header.appendChild(number);
  header.appendChild(text);
  card.appendChild(header);

  const optionsWrap = document.createElement('div');
  optionsWrap.className = 'options';

  const options = [
    { k: 'Lựa chọn A', label: 'A' },
    { k: 'Lựa chọn B', label: 'B' },
    { k: 'Lựa chọn C', label: 'C' },
    { k: 'Lựa chọn D', label: 'D' },
  ];

  const groupName = `q-${idx}`;
  options.forEach(opt => {
    const val = item[opt.k];
    if (!val) return;
    const optionEl = document.createElement('label');
    optionEl.className = 'option';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = groupName;
    radio.value = val;
    radio.setAttribute('aria-label', `Chọn đáp án ${opt.label}`);

    const span = document.createElement('span');
    span.innerHTML = `<strong>${opt.label}.</strong> ${val}`;

    optionEl.appendChild(radio);
    optionEl.appendChild(span);
    optionsWrap.appendChild(optionEl);
  });
  card.appendChild(optionsWrap);

  const answer = document.createElement('div');
  answer.className = 'answer-result';
  answer.style.display = 'none';
  card.appendChild(answer);

  optionsWrap.addEventListener('change', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    const chosen = target.value.trim();
    const correct = (item['Đáp án Đúng'] || '').trim();
    const isCorrect = chosen === correct;
    answer.style.display = 'block';
    answer.classList.toggle('correct', isCorrect);
    answer.classList.toggle('wrong', !isCorrect);
    const status = isCorrect ? 'Đúng' : 'Sai';
    answer.textContent = `${status}. Đáp án đúng: ${correct}`;
  });

  return card;
}

function renderQuestions(items, chapterFilter) {
  const mount = document.getElementById('questions');
  mount.innerHTML = '';
  const filtered = chapterFilter && chapterFilter !== '__ALL__'
    ? items.filter(x => x['Chương'] === chapterFilter)
    : items;
  filtered.forEach((item, idx) => {
    const card = buildQuestionCard(item, idx);
    mount.appendChild(card);
  });
}

function filterItems(items, chapterFilter) {
  return chapterFilter && chapterFilter !== '__ALL__'
    ? items.filter(x => x['Chương'] === chapterFilter)
    : items.slice();
}

function renderList(list) {
  const mount = document.getElementById('questions');
  mount.innerHTML = '';
  list.forEach((item, idx) => {
    const card = buildQuestionCard(item, idx);
    mount.appendChild(card);
  });
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function main() {
  try {
    const csv = await loadCSV();
    const allItems = parseCSV(csv).map(x => ({
      ...x,
      'Câu số': x['Câu số'] ? Number(x['Câu số']) : x['Câu số'],
    }));
    const chapters = distinctChapters(allItems);
    renderChapterOptions(chapters);

    let currentFilter = '__ALL__';
    let currentList = filterItems(allItems, currentFilter);
    renderList(currentList);

    const select = document.getElementById('chapterSelect');
    const shuffleBtn = document.getElementById('shuffleBtn');
    const resetBtn = document.getElementById('resetBtn');

    select.addEventListener('change', () => {
      currentFilter = select.value;
      currentList = filterItems(allItems, currentFilter);
      renderList(currentList);
    });

    shuffleBtn.addEventListener('click', () => {
      currentList = shuffle(currentList);
      renderList(currentList);
    });

    resetBtn.addEventListener('click', () => {
      currentFilter = '__ALL__';
      select.value = '__ALL__';
      currentList = filterItems(allItems, currentFilter);
      renderList(currentList);
    });
  } catch (err) {
    const mount = document.getElementById('questions');
    const error = document.createElement('div');
    error.className = 'question-card';
    error.textContent = 'Lỗi tải dữ liệu CSV: ' + err.message;
    mount.appendChild(error);
  }
}

main();
