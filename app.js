// Read and render questions from CSV with chapter filter and instant answer reveal

let currentTab = 'general';
let allGeneralItems = [];
let allMarketingItems = [];
let allQtsxItems = [];

// Exam mode variables
let examMode = false;
let examQuestions = [];
let examAnswers = {};
let examSubmitted = false;

async function loadCSV(filename) {
  const res = await fetch(`./${filename}`);
  if (!res.ok) throw new Error(`Không thể đọc file ${filename}`);
  const text = await res.text();
  return text;
}

function parseCSV(text) {
  let s = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        const next = s[i + 1];
        if (next === '"') {
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
        if (row.some(cell => cell.trim())) {
          rows.push(row);
        }
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }
  
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some(cell => cell.trim())) {
      rows.push(row);
    }
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map(h => h.trim());
  const dataRows = rows.slice(1);
  
  return dataRows
    .map((r) => {
      const obj = {};
      for (let i = 0; i < headers.length; i++) {
        obj[headers[i]] = (r[i] ?? '').trim();
      }
      return obj;
    })
    .filter(obj => obj['Nội dung Câu hỏi'] && obj['Nội dung Câu hỏi'].trim());
}

function distinctChapters(items) {
  const set = new Set(items.map(x => x['Chương']).filter(Boolean));
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
}

function renderChapterOptions(chapters) {
  const select = document.getElementById('chapterSelect');
  while (select.options.length > 1) select.remove(1);
  chapters.forEach(ch => {
    const opt = document.createElement('option');
    opt.value = ch;
    opt.textContent = ch;
    select.appendChild(opt);
  });
}

function buildQuestionCard(item, idx, isExamMode = false) {
  const card = document.createElement('div');
  card.className = 'question-card';
  card.dataset.index = String(idx);

  const header = document.createElement('div');
  header.className = 'question-header';
  const number = document.createElement('div');
  number.className = 'question-number';
  number.textContent = isExamMode ? `Câu ${idx + 1}` : `Câu ${item['Câu số']}`;
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

  const groupName = `q-${idx}-${Date.now()}`;
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

  if (isExamMode) {
    // Exam mode: track answers, don't show result immediately
    optionsWrap.addEventListener('change', (e) => {
      const target = e.target;
      if (!(target instanceof HTMLInputElement)) return;
      examAnswers[idx] = target.value.trim();
      updateExamProgress();
    });
  } else {
    // Practice mode: show result immediately
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
  }

  return card;
}

function filterItems(items, chapterFilter) {
  return chapterFilter && chapterFilter !== '__ALL__'
    ? items.filter(x => x['Chương'] === chapterFilter)
    : items.slice();
}

function renderList(list, isExamMode = false) {
  const mount = document.getElementById('questions');
  mount.innerHTML = '';
  list.forEach((item, idx) => {
    const card = buildQuestionCard(item, idx, isExamMode);
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

// Custom Dialog
function showDialog(icon, title, message) {
  document.getElementById('dialogIcon').textContent = icon;
  document.getElementById('dialogTitle').textContent = title;
  document.getElementById('dialogMessage').textContent = message;
  document.getElementById('dialogOverlay').style.display = 'flex';
}

function hideDialog() {
  document.getElementById('dialogOverlay').style.display = 'none';
}

function getCurrentItems() {
  if (currentTab === 'marketing') return allMarketingItems;
  if (currentTab === 'qtsx') return allQtsxItems;
  return allGeneralItems;
}

function switchTab(tab) {
  currentTab = tab;
  examMode = false;
  examSubmitted = false;
  
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  
  const filtersBar = document.getElementById('filtersBar');
  const examPanel = document.getElementById('examPanel');
  const examConfig = document.getElementById('examConfig');
  const examInfo = document.getElementById('examInfo');
  const resultPanel = document.getElementById('resultPanel');
  
  resultPanel.style.display = 'none';
  
  if (tab === 'exam') {
    filtersBar.style.display = 'none';
    examPanel.style.display = 'block';
    examConfig.style.display = 'block';
    examInfo.style.display = 'none';
    updateMaxQuestions();
    document.getElementById('questions').innerHTML = '';
  } else {
    filtersBar.style.display = 'block';
    examPanel.style.display = 'none';
    
    const items = getCurrentItems();
    const chapters = distinctChapters(items);
    renderChapterOptions(chapters);
    
    const select = document.getElementById('chapterSelect');
    select.value = '__ALL__';
    
    renderList(filterItems(items, '__ALL__'));
  }
}

function updateMaxQuestions() {
  const source = document.getElementById('examSource').value;
  let maxQ = 0;
  if (source === 'general') maxQ = allGeneralItems.length;
  else if (source === 'marketing') maxQ = allMarketingItems.length;
  else if (source === 'qtsx') maxQ = allQtsxItems.length;
  else maxQ = allGeneralItems.length + allMarketingItems.length + allQtsxItems.length;
  
  document.getElementById('maxQuestions').textContent = `(Tối đa: ${maxQ} câu)`;
  document.getElementById('questionCount').max = maxQ;
}

function generateExam() {
  const source = document.getElementById('examSource').value;
  let count = parseInt(document.getElementById('questionCount').value) || 20;
  
  let pool = [];
  if (source === 'general') pool = allGeneralItems.slice();
  else if (source === 'marketing') pool = allMarketingItems.slice();
  else if (source === 'qtsx') pool = allQtsxItems.slice();
  else pool = [...allGeneralItems, ...allMarketingItems, ...allQtsxItems];
  
  count = Math.min(count, pool.length);
  
  // Shuffle and pick
  examQuestions = shuffle(pool).slice(0, count);
  examAnswers = {};
  examSubmitted = false;
  examMode = true;
  
  document.getElementById('examConfig').style.display = 'none';
  document.getElementById('examInfo').style.display = 'flex';
  document.getElementById('resultPanel').style.display = 'none';
  
  updateExamProgress();
  renderList(examQuestions, true);
}

function updateExamProgress() {
  const answered = Object.keys(examAnswers).length;
  const total = examQuestions.length;
  document.getElementById('examProgress').textContent = `Đã làm: ${answered}/${total}`;
}

function submitExam() {
  const answered = Object.keys(examAnswers).length;
  const total = examQuestions.length;
  
  if (answered < total) {
    const remaining = total - answered;
    showDialog('⚠️', 'Chưa hoàn thành', `Bạn còn ${remaining} câu chưa làm. Vui lòng hoàn thành tất cả câu hỏi trước khi nộp bài.`);
    return;
  }
  
  examSubmitted = true;
  calculateAndShowResult();
}

function calculateAndShowResult() {
  const total = examQuestions.length;
  const pointPerQuestion = 10 / total;
  let correctCount = 0;
  
  examQuestions.forEach((q, idx) => {
    const userAnswer = examAnswers[idx] || '';
    const correctAnswer = (q['Đáp án Đúng'] || '').trim();
    if (userAnswer === correctAnswer) {
      correctCount++;
    }
  });
  
  const score = (correctCount * pointPerQuestion).toFixed(2);
  
  document.getElementById('scoreDisplay').innerHTML = `
    <div class="score-number">${score}/10</div>
    <div class="score-detail">Đúng ${correctCount}/${total} câu</div>
  `;
  
  document.getElementById('resultDetails').innerHTML = `
    <p>Điểm mỗi câu: ${pointPerQuestion.toFixed(4)} điểm</p>
  `;
  
  document.getElementById('resultPanel').style.display = 'flex';
  document.getElementById('examInfo').style.display = 'none';
  document.getElementById('questions').innerHTML = '';
}

function reviewExam() {
  document.getElementById('resultPanel').style.display = 'none';
  document.getElementById('examInfo').style.display = 'flex';
  document.getElementById('examInfo').innerHTML = `
    <div class="exam-header">
      <span>Xem lại đáp án</span>
      <button id="backToResultBtn" class="secondary-btn">Quay lại kết quả</button>
      <button id="newExamBtn2" class="secondary-btn">Tạo đề mới</button>
    </div>
  `;
  
  document.getElementById('backToResultBtn').addEventListener('click', () => {
    document.getElementById('resultPanel').style.display = 'flex';
    document.getElementById('examInfo').style.display = 'none';
    document.getElementById('questions').innerHTML = '';
  });
  
  document.getElementById('newExamBtn2').addEventListener('click', resetExam);
  
  renderExamReview();
}

function renderExamReview() {
  const mount = document.getElementById('questions');
  mount.innerHTML = '';
  
  examQuestions.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = 'question-card';
    
    const userAnswer = examAnswers[idx] || '';
    const correctAnswer = (item['Đáp án Đúng'] || '').trim();
    const isCorrect = userAnswer === correctAnswer;
    
    card.classList.add(isCorrect ? 'review-correct' : 'review-wrong');

    const header = document.createElement('div');
    header.className = 'question-header';
    const number = document.createElement('div');
    number.className = 'question-number';
    number.innerHTML = `Câu ${idx + 1} ${isCorrect ? '<span class="badge correct">✓</span>' : '<span class="badge wrong">✗</span>'}`;
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

    options.forEach(opt => {
      const val = item[opt.k];
      if (!val) return;
      const optionEl = document.createElement('div');
      optionEl.className = 'option review-option';
      
      const isUserChoice = userAnswer === val;
      const isCorrectChoice = correctAnswer === val;
      
      if (isCorrectChoice) {
        optionEl.classList.add('correct-answer');
      }
      if (isUserChoice && !isCorrectChoice) {
        optionEl.classList.add('wrong-answer');
      }

      const span = document.createElement('span');
      let prefix = '';
      if (isCorrectChoice) prefix = '✓ ';
      if (isUserChoice && !isCorrectChoice) prefix = '✗ ';
      span.innerHTML = `<strong>${opt.label}.</strong> ${prefix}${val}`;

      optionEl.appendChild(span);
      optionsWrap.appendChild(optionEl);
    });
    card.appendChild(optionsWrap);
    
    mount.appendChild(card);
  });
}

function resetExam() {
  examQuestions = [];
  examAnswers = {};
  examSubmitted = false;
  examMode = false;
  
  document.getElementById('examConfig').style.display = 'block';
  document.getElementById('examInfo').style.display = 'none';
  document.getElementById('examInfo').innerHTML = `
    <div class="exam-header">
      <span id="examProgress">Câu: 0/0</span>
      <span id="examTimer"></span>
      <button id="submitExamBtn" class="submit-btn">Nộp bài</button>
      <button id="newExamBtn" class="secondary-btn">Tạo đề mới</button>
    </div>
  `;
  document.getElementById('resultPanel').style.display = 'none';
  document.getElementById('questions').innerHTML = '';
  
  // Re-attach event listeners
  document.getElementById('submitExamBtn').addEventListener('click', submitExam);
  document.getElementById('newExamBtn').addEventListener('click', resetExam);
}

async function main() {
  try {
    const [generalCsv, marketingCsv, qtsxCsv] = await Promise.all([
      loadCSV('dap_an.csv'),
      loadCSV('marketing.csv'),
      loadCSV('qtsx.csv')
    ]);
    
    allGeneralItems = parseCSV(generalCsv).map(x => ({
      ...x,
      'Câu số': x['Câu số'] ? Number(x['Câu số']) : x['Câu số'],
    }));
    
    allMarketingItems = parseCSV(marketingCsv).map(x => ({
      ...x,
      'Câu số': x['Câu số'] ? Number(x['Câu số']) : x['Câu số'],
    }));
    
    allQtsxItems = parseCSV(qtsxCsv).map(x => ({
      ...x,
      'Câu số': x['Câu số'] ? Number(x['Câu số']) : x['Câu số'],
    }));

    switchTab('general');

    const select = document.getElementById('chapterSelect');
    const shuffleBtn = document.getElementById('shuffleBtn');
    const resetBtn = document.getElementById('resetBtn');

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        switchTab(btn.dataset.tab);
      });
    });

    select.addEventListener('change', () => {
      const items = getCurrentItems();
      const currentList = filterItems(items, select.value);
      renderList(currentList);
    });

    shuffleBtn.addEventListener('click', () => {
      const items = getCurrentItems();
      const currentList = shuffle(filterItems(items, select.value));
      renderList(currentList);
    });

    resetBtn.addEventListener('click', () => {
      select.value = '__ALL__';
      const items = getCurrentItems();
      renderList(filterItems(items, '__ALL__'));
    });

    // Exam controls
    document.getElementById('examSource').addEventListener('change', updateMaxQuestions);
    document.getElementById('generateExamBtn').addEventListener('click', generateExam);
    document.getElementById('submitExamBtn').addEventListener('click', submitExam);
    document.getElementById('newExamBtn').addEventListener('click', resetExam);
    document.getElementById('reviewExamBtn').addEventListener('click', reviewExam);
    document.getElementById('retakeExamBtn').addEventListener('click', () => {
      document.getElementById('resultPanel').style.display = 'none';
      resetExam();
    });
    
    // Dialog
    document.getElementById('dialogOkBtn').addEventListener('click', hideDialog);
    document.getElementById('dialogOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'dialogOverlay') hideDialog();
    });

  } catch (err) {
    const mount = document.getElementById('questions');
    const error = document.createElement('div');
    error.className = 'question-card';
    error.textContent = 'Lỗi tải dữ liệu: ' + err.message;
    mount.appendChild(error);
  }
}

main();