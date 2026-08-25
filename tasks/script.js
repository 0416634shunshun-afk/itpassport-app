/* =========================================================
   制作案件タスク管理
   - データはブラウザの localStorage にのみ保存（外部API・DBなし）
   ========================================================= */

'use strict';

var STORAGE_KEY = 'seisaku-task-app-v1';
var BASE_TITLE = document.title;

var PRIORITY_LABEL = { high: '優先度：高', mid: '優先度：中', low: '優先度：低' };
var PRIORITY_ORDER = { high: 0, mid: 1, low: 2 };
var STATUS_LABEL = { todo: '未着手', doing: '対応中', done: '完了' };

/* 画面の状態 */
var tasks = [];
var editingId = null;
var filter = {
  keyword: '',
  status: 'all',   // all / todo / doing / done / over
  assignee: 'all',
  priority: 'all',
  sort: 'due-asc'
};

/* ---------- 要素の取得 ---------- */
var $ = function (id) { return document.getElementById(id); };

var form = $('taskForm');
var titleInput = $('title');
var clientInput = $('client');
var assigneeInput = $('assignee');
var priorityInput = $('priority');
var dueInput = $('due');
var statusInput = $('status');
var memoInput = $('memo');
var submitBtn = $('submitBtn');
var submitBtnText = $('submitBtnText');
var formIconUse = $('formIconUse');
var cancelBtn = $('cancelBtn');
var formTitle = $('formTitle');
var titleError = $('titleError');
var listEl = $('taskList');
var emptyMsg = $('emptyMsg');
var listCount = $('listCount');
var toastEl = $('toast');
var toastText = $('toastText');

/* =========================================================
   保存 / 読み込み
   ========================================================= */
function load() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    var data = raw ? JSON.parse(raw) : [];
    tasks = Array.isArray(data) ? data.map(normalize) : [];
  } catch (e) {
    tasks = [];
    showToast('保存データを読み込めませんでした');
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (e) {
    showToast('保存できませんでした（ブラウザの空き容量をご確認ください）');
  }
}

function normalize(t) {
  return {
    id: t.id || createId(),
    title: String(t.title || '(タイトルなし)'),
    client: String(t.client || ''),
    assignee: String(t.assignee || ''),
    priority: PRIORITY_LABEL[t.priority] ? t.priority : 'mid',
    due: /^\d{4}-\d{2}-\d{2}$/.test(t.due) ? t.due : '',
    status: STATUS_LABEL[t.status] ? t.status : 'todo',
    memo: String(t.memo || ''),
    createdAt: t.createdAt || Date.now()
  };
}

function createId() {
  return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* =========================================================
   期限の判定
   ========================================================= */
function today0() {
  var d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysLeft(due) {
  var d = new Date(due + 'T00:00:00');
  if (isNaN(d.getTime())) { return null; }
  return Math.round((d - today0()) / 86400000);
}

function isOverdue(task) {
  if (!task.due || task.status === 'done') { return false; }
  var left = daysLeft(task.due);
  return left !== null && left < 0;
}

function formatDate(due) {
  var d = new Date(due + 'T00:00:00');
  if (isNaN(d.getTime())) { return due; }
  var week = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return (d.getMonth() + 1) + '/' + d.getDate() + '（' + week + '）';
}

function dueBadge(task) {
  if (!task.due) { return { text: '期限なし', cls: 'tag-due-none' }; }
  var base = formatDate(task.due);
  if (task.status === 'done') { return { text: '期限 ' + base, cls: 'tag-due-ok' }; }
  var left = daysLeft(task.due);
  if (left < 0) { return { text: base + ' ／ ' + (-left) + '日超過', cls: 'tag-due-over' }; }
  if (left === 0) { return { text: base + ' ／ 今日まで', cls: 'tag-due-soon' }; }
  if (left === 1) { return { text: base + ' ／ 明日まで', cls: 'tag-due-soon' }; }
  if (left <= 3) { return { text: base + ' ／ あと' + left + '日', cls: 'tag-due-near' }; }
  return { text: base + ' ／ あと' + left + '日', cls: 'tag-due-ok' };
}

/* =========================================================
   フォーム
   ========================================================= */
form.addEventListener('submit', function (e) {
  e.preventDefault();

  var title = titleInput.value.trim();
  if (!title) {
    titleError.hidden = false;
    titleInput.classList.add('is-invalid');
    titleInput.focus();
    return;
  }
  titleError.hidden = true;
  titleInput.classList.remove('is-invalid');

  var values = {
    title: title,
    client: clientInput.value.trim(),
    assignee: assigneeInput.value.trim(),
    priority: priorityInput.value,
    due: dueInput.value,
    status: statusInput.value,
    memo: memoInput.value.trim()
  };

  if (editingId) {
    var target = tasks.filter(function (t) { return t.id === editingId; })[0];
    if (target) {
      Object.keys(values).forEach(function (k) { target[k] = values[k]; });
    }
    showToast('タスクを更新しました');
    endEdit();
  } else {
    values.id = createId();
    values.createdAt = Date.now();
    tasks.push(values);
    showToast('タスクを追加しました');
    form.reset();
    priorityInput.value = 'mid';
    statusInput.value = 'todo';
  }

  save();
  render();
  titleInput.focus();
});

titleInput.addEventListener('input', function () {
  if (titleInput.value.trim()) {
    titleError.hidden = true;
    titleInput.classList.remove('is-invalid');
  }
});

cancelBtn.addEventListener('click', function () {
  endEdit();
  showToast('編集をやめました');
});

function startEdit(id) {
  var t = tasks.filter(function (x) { return x.id === id; })[0];
  if (!t) { return; }

  editingId = id;
  titleInput.value = t.title;
  clientInput.value = t.client;
  assigneeInput.value = t.assignee;
  priorityInput.value = t.priority;
  dueInput.value = t.due;
  statusInput.value = t.status;
  memoInput.value = t.memo;

  formTitle.textContent = 'タスクを編集する';
  submitBtnText.textContent = '変更を保存する';
  formIconUse.setAttribute('href', '#i-edit');
  cancelBtn.hidden = false;
  $('formPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  titleInput.focus();
}

function endEdit() {
  editingId = null;
  form.reset();
  priorityInput.value = 'mid';
  statusInput.value = 'todo';
  formTitle.textContent = 'タスクを追加する';
  submitBtnText.textContent = 'この内容で追加する';
  formIconUse.setAttribute('href', '#i-plus');
  cancelBtn.hidden = true;
  titleError.hidden = true;
  titleInput.classList.remove('is-invalid');
}

/* =========================================================
   絞り込み・並び替え
   ========================================================= */
$('keyword').addEventListener('input', function (e) {
  filter.keyword = e.target.value.trim().toLowerCase();
  render();
});
$('filterAssignee').addEventListener('change', function (e) {
  filter.assignee = e.target.value; render();
});
$('filterPriority').addEventListener('change', function (e) {
  filter.priority = e.target.value; render();
});
$('sort').addEventListener('change', function (e) {
  filter.sort = e.target.value; render();
});

Array.prototype.forEach.call(document.querySelectorAll('.stat'), function (btn) {
  btn.addEventListener('click', function () {
    filter.status = btn.dataset.status;
    render();
  });
});

$('overdueBannerBtn').addEventListener('click', function () {
  filter.status = 'over';
  render();
  listEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('resetFilterBtn').addEventListener('click', function () {
  filter.keyword = '';
  filter.status = 'all';
  filter.assignee = 'all';
  filter.priority = 'all';
  filter.sort = 'due-asc';
  $('keyword').value = '';
  $('filterPriority').value = 'all';
  $('sort').value = 'due-asc';
  render();
  showToast('絞り込みを解除しました');
});

function visibleTasks() {
  var list = tasks.filter(function (t) {
    if (filter.status === 'over') {
      if (!isOverdue(t)) { return false; }
    } else if (filter.status !== 'all' && t.status !== filter.status) {
      return false;
    }
    if (filter.assignee !== 'all') {
      var name = t.assignee || '(担当者なし)';
      if (name !== filter.assignee) { return false; }
    }
    if (filter.priority !== 'all' && t.priority !== filter.priority) { return false; }
    if (filter.keyword) {
      var hay = [t.title, t.client, t.assignee, t.memo].join(' ').toLowerCase();
      if (hay.indexOf(filter.keyword) === -1) { return false; }
    }
    return true;
  });

  list.sort(function (a, b) {
    // 期限切れタスクは、選んでいる並び替えに関わらず常に最上部にまとめる
    var overdueRank = (isOverdue(a) ? 0 : 1) - (isOverdue(b) ? 0 : 1);
    if (overdueRank !== 0) { return overdueRank; }
    return compareBySort(a, b);
  });
  return list;
}

function compareBySort(a, b) {
  var far = '9999-12-31';
  switch (filter.sort) {
    case 'due-desc':
      return (b.due || '0000-01-01').localeCompare(a.due || '0000-01-01');
    case 'priority':
      if (PRIORITY_ORDER[a.priority] !== PRIORITY_ORDER[b.priority]) {
        return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      }
      return (a.due || far).localeCompare(b.due || far);
    case 'created-desc':
      return b.createdAt - a.createdAt;
    default: // due-asc
      if ((a.due || far) !== (b.due || far)) {
        return (a.due || far).localeCompare(b.due || far);
      }
      return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  }
}

/* =========================================================
   描画
   ========================================================= */
function render() {
  renderSummary();
  renderAssigneeOptions();

  var list = visibleTasks();
  listCount.textContent = list.length + '件';
  listEl.innerHTML = '';

  if (list.length === 0) {
    emptyMsg.hidden = false;
    var msg = tasks.length === 0
      ? 'まだタスクがありません。上のフォームから最初のタスクを追加してください。'
      : '条件に合うタスクがありません。「絞り込みを解除」で全件表示に戻せます。';
    emptyMsg.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-inbox"></use></svg><span>' + esc(msg) + '</span>';
    return;
  }
  emptyMsg.hidden = true;

  list.forEach(function (t) { listEl.appendChild(taskCard(t)); });
}

function taskCard(t) {
  var card = document.createElement('article');
  card.className = 'task p-' + t.priority +
    (t.status === 'done' ? ' is-done' : '') +
    (isOverdue(t) ? ' is-overdue' : '');

  var badge = dueBadge(t);
  var main = document.createElement('div');
  main.className = 'task-main';
  main.innerHTML =
    '<h3 class="task-title">' + esc(t.title) + '</h3>' +
    (t.client ? '<p class="task-client">案件：' + esc(t.client) + '</p>' : '') +
    '<div class="tags">' +
      '<span class="tag tag-person">担当：' + esc(t.assignee || '未設定') + '</span>' +
      '<span class="tag tag-' + t.priority + '">' + PRIORITY_LABEL[t.priority] + '</span>' +
      '<span class="tag ' + badge.cls + '">' + esc(badge.text) + '</span>' +
      '<span class="tag tag-status-' + t.status + '">' + STATUS_LABEL[t.status] + '</span>' +
    '</div>' +
    (t.memo ? '<p class="task-memo">' + esc(t.memo) + '</p>' : '');

  var side = document.createElement('div');
  side.className = 'task-side';

  var select = document.createElement('select');
  select.setAttribute('aria-label', t.title + ' のステータスを変更');
  ['todo', 'doing', 'done'].forEach(function (s) {
    var op = document.createElement('option');
    op.value = s;
    op.textContent = STATUS_LABEL[s];
    if (t.status === s) { op.selected = true; }
    select.appendChild(op);
  });
  select.addEventListener('change', function () {
    t.status = select.value;
    save();
    render();
    showToast('「' + t.title + '」を' + STATUS_LABEL[t.status] + 'にしました');
  });

  var buttons = document.createElement('div');
  buttons.className = 'task-buttons';

  var editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'btn btn-ghost btn-sm';
  editBtn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-edit"></use></svg>編集';
  editBtn.addEventListener('click', function () { startEdit(t.id); });

  var delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'btn btn-danger-ghost btn-sm';
  delBtn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-trash"></use></svg>削除';
  delBtn.addEventListener('click', function () {
    if (!window.confirm('「' + t.title + '」を削除します。よろしいですか？')) { return; }
    tasks = tasks.filter(function (x) { return x.id !== t.id; });
    if (editingId === t.id) { endEdit(); }
    save();
    render();
    showToast('削除しました');
  });

  buttons.appendChild(editBtn);
  buttons.appendChild(delBtn);
  side.appendChild(select);
  side.appendChild(buttons);

  card.appendChild(main);
  card.appendChild(side);
  return card;
}

function renderSummary() {
  var counts = { all: tasks.length, todo: 0, doing: 0, done: 0, over: 0 };
  tasks.forEach(function (t) {
    counts[t.status] += 1;
    if (isOverdue(t)) { counts.over += 1; }
  });
  $('statAll').textContent = counts.all;
  $('statTodo').textContent = counts.todo;
  $('statDoing').textContent = counts.doing;
  $('statDone').textContent = counts.done;
  $('statOver').textContent = counts.over;

  Array.prototype.forEach.call(document.querySelectorAll('.stat'), function (btn) {
    btn.setAttribute('aria-pressed', btn.dataset.status === filter.status ? 'true' : 'false');
  });

  updateOverdueBanner(counts.over);
}

function updateOverdueBanner(count) {
  var banner = $('overdueBanner');
  if (count > 0) {
    $('overdueBannerText').textContent = '期限切れのタスクが' + count + '件あります。至急ご確認ください。';
    banner.hidden = false;
    document.title = '⚠(' + count + ') ' + BASE_TITLE;
  } else {
    banner.hidden = true;
    document.title = BASE_TITLE;
  }
}

function renderAssigneeOptions() {
  var names = [];
  tasks.forEach(function (t) {
    var name = t.assignee || '(担当者なし)';
    if (names.indexOf(name) === -1) { names.push(name); }
  });
  names.sort();

  var sel = $('filterAssignee');
  if (names.indexOf(filter.assignee) === -1 && filter.assignee !== 'all') {
    filter.assignee = 'all';
  }
  sel.innerHTML = '<option value="all">すべて</option>';
  names.forEach(function (n) {
    var op = document.createElement('option');
    op.value = n;
    op.textContent = n;
    if (filter.assignee === n) { op.selected = true; }
    sel.appendChild(op);
  });

  var dl = $('assigneeList');
  dl.innerHTML = '';
  names.filter(function (n) { return n !== '(担当者なし)'; }).forEach(function (n) {
    var op = document.createElement('option');
    op.value = n;
    dl.appendChild(op);
  });
}

/* =========================================================
   CSV書き出し / サンプル / 全削除
   ========================================================= */
$('csvBtn').addEventListener('click', function () {
  if (tasks.length === 0) {
    showToast('書き出すタスクがありません');
    return;
  }
  var header = ['タスク名', '案件名', '担当者', '優先度', '期限', 'ステータス', 'メモ', '登録日'];
  var rows = visibleTasks().map(function (t) {
    return [
      t.title,
      t.client,
      t.assignee,
      { high: '高', mid: '中', low: '低' }[t.priority],
      t.due,
      STATUS_LABEL[t.status],
      t.memo,
      new Date(t.createdAt).toLocaleDateString('ja-JP')
    ];
  });
  var csv = [header].concat(rows).map(function (row) {
    return row.map(function (cell) {
      return '"' + String(cell).replace(/"/g, '""') + '"';
    }).join(',');
  }).join('\r\n');

  // Excelで文字化けしないように BOM を付ける
  var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'tasks_' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('CSVを書き出しました');
});

$('sampleBtn').addEventListener('click', function () {
  if (tasks.length > 0 && !window.confirm('サンプルのタスクを追加します。よろしいですか？')) { return; }

  var base = today0();
  var offset = function (n) {
    var d = new Date(base.getTime() + n * 86400000);
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  };

  [
    { title: 'トップページのデザイン修正', client: '株式会社サンプル／コーポレートサイト', assignee: '山田', priority: 'high', due: offset(-1), status: 'doing', memo: '先方から赤字あり。デザイナーへ共有済み。' },
    { title: '見積書の作成と送付', client: '春の新商品LP', assignee: '佐藤', priority: 'high', due: offset(0), status: 'todo', memo: '概算は50万円前後で提示予定。' },
    { title: '撮影スケジュールの確定', client: '株式会社テスト／商品カタログ', assignee: '山田', priority: 'mid', due: offset(3), status: 'todo', memo: 'スタジオの空き状況を確認する。' },
    { title: '初回打ち合わせ議事録の共有', client: '株式会社サンプル／コーポレートサイト', assignee: '鈴木', priority: 'low', due: offset(7), status: 'todo', memo: '' },
    { title: '契約書の返送', client: '春の新商品LP', assignee: '佐藤', priority: 'mid', due: offset(-5), status: 'done', memo: '押印済みで返送完了。' }
  ].forEach(function (s) {
    s.id = createId();
    s.createdAt = Date.now() - Math.floor(Math.random() * 100000);
    tasks.push(s);
  });

  save();
  render();
  showToast('サンプルを追加しました');
});

$('clearBtn').addEventListener('click', function () {
  if (tasks.length === 0) {
    showToast('削除するタスクがありません');
    return;
  }
  if (!window.confirm('登録中のタスクをすべて削除します。元に戻せませんが、よろしいですか？')) { return; }
  tasks = [];
  endEdit();
  save();
  render();
  showToast('すべて削除しました');
});

/* =========================================================
   ユーティリティ
   ========================================================= */
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

var toastTimer = null;
function showToast(message) {
  toastText.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2200);
}

/* ---------- 起動 ---------- */
load();
render();
