const STAGES = [
  ['source_qa', 'Проверяем фотографии'],
  ['identity_analysis', 'Восстанавливаем идентичность'],
  ['identity_lock', 'Фиксируем уникальные признаки'],
  ['character_cards', 'Создаём карточки персонажа'],
  ['character_cards_qa', 'Проверяем сходство карточек'],
  ['scene_plan', 'Режиссируем встречу'],
  ['anchor_frames', 'Создаём ключевые кадры'],
  ['anchor_frames_qa', 'Проверяем ключевые кадры'],
  ['video_generation', 'Создаём фильм'],
  ['video_qa', 'Проверяем идентичность в видео'],
  ['finalize', 'Финализируем фильм'],
];

let selectedProjectId = null;
let pollTimer = null;

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.error || `HTTP ${res.status}`);
  return data;
}

async function loadHealth() {
  const el = document.getElementById('system-status');
  try {
    const data = await jsonFetch('/api/health');
    if (!data.openrouter_configured) {
      el.className = 'system-status warn';
      el.innerHTML = '<strong>Нужен OPENROUTER_API_KEY.</strong> Добавьте ключ в .env и перезапустите приложение.';
      return;
    }
    if (!data.public_https_ready) {
      el.className = 'system-status warn';
      el.innerHTML = '<strong>Анализ и карточки готовы к работе.</strong> Для генерации видео потребуется PUBLIC_BASE_URL с публичным HTTPS-адресом приложения.';
      return;
    }
    el.className = 'system-status ok';
    el.innerHTML = '<strong>Система готова.</strong> OpenRouter подключён, публичный media URL доступен.';
  } catch (err) {
    el.className = 'system-status error';
    el.textContent = `Ошибка API: ${err.message}`;
  }
}

async function refreshModels() {
  const el = document.getElementById('system-status');
  el.className = 'system-status';
  el.textContent = 'Синхронизируем доступные модели OpenRouter…';
  try {
    const data = await jsonFetch('/api/models/refresh', { method: 'POST' });
    const s = data.summary || {};
    el.className = 'system-status ok';
    el.innerHTML = `<strong>Каталог моделей обновлён.</strong> Vision: ${s.vision_count || 0}, image: ${s.image_count || 0}, video: ${s.video_count || 0}.`;
  } catch (err) {
    el.className = 'system-status error';
    el.textContent = `Не удалось обновить каталог: ${err.message}`;
  }
}

function setFileLabel(inputId, stateId) {
  const input = document.getElementById(inputId);
  const state = document.getElementById(stateId);
  const count = input.files.length;
  if (count > 2) {
    input.value = '';
    state.textContent = 'Максимум 2 фото';
    state.classList.add('bad');
    return;
  }
  state.classList.remove('bad');
  state.textContent = count ? `${count} ${count === 1 ? 'фото выбрано' : 'фото выбраны'}` : 'Выбрать фото';
}

async function createProject(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.getElementById('create-status');
  const childFiles = document.getElementById('child-files').files;
  const adultFiles = document.getElementById('adult-files').files;

  if (childFiles.length < 1 || childFiles.length > 2 || adultFiles.length < 1 || adultFiles.length > 2) {
    status.className = 'inline-status error';
    status.textContent = 'Нужно выбрать 1–2 фото из детства и 1–2 фото из настоящего.';
    return;
  }

  const fd = new FormData();
  fd.append('meta_json', JSON.stringify({
    title: form.title.value.trim(),
    person_name: form.person_name.value.trim() || null,
    memory_note: form.memory_note.value.trim() || null,
    scene_preset: form.scene_preset.value,
    aspect_ratio: form.aspect_ratio.value,
    duration: Number(form.duration.value),
    resolution: '720p',
    generate_audio: form.generate_audio.checked,
    child_age_offset: 0,
    adult_age_offset: 0,
  }));
  for (const file of childFiles) fd.append('child_files', file);
  for (const file of adultFiles) fd.append('adult_files', file);

  status.className = 'inline-status';
  status.textContent = 'Загружаем оригиналы без изменений…';
  try {
    const data = await jsonFetch('/api/projects', { method: 'POST', body: fd });
    status.className = 'inline-status ok';
    status.textContent = 'Проект создан. Исходные файлы сохранены.';
    await loadProjects();
    await selectProject(data.id);
  } catch (err) {
    status.className = 'inline-status error';
    status.textContent = err.message;
  }
}

async function loadProjects() {
  const container = document.getElementById('projects');
  try {
    const data = await jsonFetch('/api/projects');
    const items = data.items || [];
    if (!items.length) {
      container.innerHTML = '<div class="empty-state">Проектов пока нет.</div>';
      return;
    }
    container.innerHTML = items.map(item => {
      const title = esc(item.meta?.title || 'Без названия');
      const name = esc(item.meta?.person_name || 'Без имени');
      const status = esc(humanStatus(item.status));
      const active = item.id === selectedProjectId ? ' active' : '';
      return `<button class="project-item${active}" type="button" onclick="selectProject('${esc(item.id)}')">
        <span class="project-item-main"><strong>${title}</strong><small>${name}</small></span>
        <span class="project-item-meta"><span class="status-dot ${statusClass(item.status)}"></span>${status}</span>
      </button>`;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div class="empty-state error">${esc(err.message)}</div>`;
  }
}

async function selectProject(projectId) {
  selectedProjectId = projectId;
  document.getElementById('production').classList.remove('hidden');
  await refreshSelectedProject();
  await loadProjects();
  document.getElementById('production').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function runSelectedProject() {
  if (!selectedProjectId) return;
  const button = document.getElementById('run-button');
  button.disabled = true;
  button.textContent = 'Запускаем…';
  try {
    await jsonFetch(`/api/projects/${encodeURIComponent(selectedProjectId)}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: selectedProjectId }),
    });
    startPolling();
    await refreshSelectedProject();
  } catch (err) {
    button.disabled = false;
    button.textContent = 'Создать фильм';
    showBlocking(err.message, 'error');
  }
}

async function refreshSelectedProject() {
  if (!selectedProjectId) return;
  try {
    const data = await jsonFetch(`/api/projects/${encodeURIComponent(selectedProjectId)}/status`);
    renderProject(data);
    if (['processing', 'queued', 'finalizing'].includes(data.status)) startPolling();
    else stopPolling();
  } catch (err) {
    showBlocking(err.message, 'error');
  }
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(refreshSelectedProject, 3500);
}

function stopPolling() {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

function renderProject(data) {
  document.getElementById('selected-id').textContent = data.id || '';
  const runButton = document.getElementById('run-button');
  const stages = data.stages || {};
  const active = ['processing', 'queued', 'finalizing'].includes(data.status);
  runButton.disabled = active;
  runButton.textContent = active ? 'Выполняется…' : (data.status === 'completed' ? 'Запустить заново' : 'Создать фильм');

  const pipeline = document.getElementById('pipeline');
  pipeline.innerHTML = STAGES.map(([key, label], index) => {
    const stage = stages[key] || { status: 'pending' };
    return `<div class="stage ${esc(stage.status || 'pending')}">
      <div class="stage-index">${String(index + 1).padStart(2, '0')}</div>
      <div class="stage-body"><strong>${esc(label)}</strong><small>${esc(stageMessage(stage))}</small></div>
      <div class="stage-state">${stageIcon(stage.status)}</div>
    </div>`;
  }).join('');

  if (data.blocking_reason || ['blocked', 'needs_review', 'awaiting_sources', 'awaiting_public_url', 'failed'].includes(data.status)) {
    const reason = formatBlocking(data);
    showBlocking(reason, data.status === 'failed' ? 'error' : 'warn');
  } else {
    hideBlocking();
  }

  renderArtifacts(data.assets || {});
  renderFinal(data.final || {}, data.status);
  document.getElementById('diagnostics-output').textContent = JSON.stringify({
    status: data.status,
    current_stage: data.current_stage,
    model_selection: compactModels(data.model_selection || {}),
    recent_diagnostics: data.recent_diagnostics || [],
  }, null, 2);

  if (data.status === 'completed') stopPolling();
}

function renderArtifacts(assets) {
  const cards = assets.character_cards || {};
  const anchors = assets.anchors || {};
  const hasCards = cards.earlier_self || cards.present_self;
  const hasAnchors = anchors.start || anchors.meeting || anchors.end;
  const wrapper = document.getElementById('artifacts');
  if (!hasCards && !hasAnchors) {
    wrapper.classList.add('hidden');
    return;
  }
  wrapper.classList.remove('hidden');

  document.getElementById('cards-preview').innerHTML = [
    cards.earlier_self ? mediaImage(cards.earlier_self, 'Я в детстве') : '',
    cards.present_self ? mediaImage(cards.present_self, 'Я сейчас') : '',
  ].join('');

  document.getElementById('anchors-preview').innerHTML = [
    anchors.start ? mediaImage(anchors.start, 'Начало') : '',
    anchors.meeting ? mediaImage(anchors.meeting, 'Встреча') : '',
    anchors.end ? mediaImage(anchors.end, 'Финал') : '',
  ].join('');
}

function renderFinal(finalData, status) {
  const section = document.getElementById('final-film');
  const container = document.getElementById('video-container');
  const video = finalData.video || {};
  const src = video.public_url || video.path;
  if (status !== 'completed' || !src) {
    section.classList.add('hidden');
    container.innerHTML = '';
    return;
  }
  section.classList.remove('hidden');
  container.innerHTML = `<video controls playsinline preload="metadata" src="${esc(src)}"></video>`;
}

function mediaImage(src, caption) {
  return `<figure class="media-card"><img loading="lazy" src="${esc(src)}" alt="${esc(caption)}"><figcaption>${esc(caption)}</figcaption></figure>`;
}

function compactModels(selection) {
  const result = {};
  for (const key of ['vision', 'image', 'video', 'video_qa']) {
    if (selection[key]) result[key] = { id: selection[key].id, reason: selection[key].reason };
  }
  return result;
}

function stageMessage(stage) {
  if (stage.message) return stage.message;
  if (stage.status === 'pending') return 'Ожидает';
  if (stage.status === 'running') return 'Выполняется';
  if (stage.status === 'passed') return 'Готово';
  if (stage.status === 'blocked') return 'Нужна проверка';
  if (stage.status === 'failed') return 'Ошибка';
  return stage.status || 'Ожидает';
}

function stageIcon(status) {
  if (status === 'passed') return '✓';
  if (status === 'running') return '<span class="spinner"></span>';
  if (status === 'blocked') return '!';
  if (status === 'failed') return '×';
  return '·';
}

function formatBlocking(data) {
  if (Array.isArray(data.blocking_reason)) {
    return data.blocking_reason.map(item => item.message || JSON.stringify(item)).join(' ');
  }
  if (data.blocking_reason) return typeof data.blocking_reason === 'string' ? data.blocking_reason : JSON.stringify(data.blocking_reason);
  const last = [...(data.recent_diagnostics || [])].reverse().find(x => ['warning', 'error'].includes(x.level));
  return last?.payload?.reason || last?.payload?.error || last?.message || 'Pipeline остановлен. Откройте диагностику.';
}

function showBlocking(message, type = 'warn') {
  const el = document.getElementById('blocking-message');
  el.className = `blocking-message ${type}`;
  el.textContent = message;
}

function hideBlocking() {
  const el = document.getElementById('blocking-message');
  el.className = 'blocking-message hidden';
  el.textContent = '';
}

function humanStatus(status) {
  return ({
    created: 'готов к запуску',
    queued: 'в очереди',
    processing: 'создаётся',
    finalizing: 'финализация',
    completed: 'готов',
    awaiting_sources: 'нужны фото',
    awaiting_public_url: 'нужен HTTPS',
    needs_review: 'нужна проверка',
    blocked: 'остановлен',
    failed: 'ошибка',
  })[status] || status || 'создан';
}

function statusClass(status) {
  if (status === 'completed') return 'good';
  if (['processing', 'queued', 'finalizing'].includes(status)) return 'live';
  if (['failed', 'blocked', 'needs_review', 'awaiting_sources', 'awaiting_public_url'].includes(status)) return 'bad';
  return '';
}

document.getElementById('project-form').addEventListener('submit', createProject);
document.getElementById('child-files').addEventListener('change', () => setFileLabel('child-files', 'child-file-state'));
document.getElementById('adult-files').addEventListener('change', () => setFileLabel('adult-files', 'adult-file-state'));

loadHealth();
loadProjects();
