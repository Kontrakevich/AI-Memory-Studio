async function loadHealth() {
  const el = document.getElementById('health');
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    const p = data.providers || {};
    el.innerHTML = `
      <span class="pill ${p.openrouter ? 'ok' : 'off'}">OpenRouter: ${p.openrouter ? 'ON' : 'OFF'}</span>
      <span class="pill ${p.ark ? 'ok' : 'off'}">Ark / Seedream / Seedance: ${p.ark ? 'ON' : 'OFF'}</span>
      <span class="model-note">Seedream: ${p.seedream_model || '—'} · Seedance: ${p.seedance_model || '—'}</span>
    `;
  } catch (err) {
    el.textContent = `API status error: ${err}`;
  }
}

async function loadProjects() {
  const res = await fetch('/api/projects');
  const data = await res.json();
  const container = document.getElementById('projects');
  container.innerHTML = '';
  for (const item of data.items || []) {
    const el = document.createElement('div');
    el.className = 'project-item';
    const stillCount = Object.keys(item.assets?.stills || {}).filter(k => k !== 'meeting_anchor').length;
    const videoStatus = item.assets?.video?.status || '—';
    el.innerHTML = `
      <div class="project-title">${item.person?.surname || ''} ${item.person?.name || ''}</div>
      <small>${item.person?.position || ''}</small><br>
      <small>${item.person?.school_years || ''}</small>
      <div class="project-meta">
        <span>${item.status || 'created'}</span>
        <span>${stillCount}/6 эпох</span>
        <span>video: ${videoStatus}</span>
      </div>
      <small class="project-id">${item.id}</small>
    `;
    el.onclick = () => {
      document.getElementById('gen-project-id').value = item.id;
      refreshSelectedProject();
    };
    container.appendChild(el);
  }
}

async function createProject(e) {
  e.preventDefault();
  const form = e.target;
  const status = document.getElementById('create-status');
  status.textContent = 'Загрузка исходников...';

  const fd = new FormData();
  fd.append('project_name', form.project_name.value);
  fd.append('person_json', JSON.stringify({
    surname: form.surname.value,
    name: form.name.value,
    position: form.position.value,
    school_years: form.school_years.value,
    epoch_note: '1970s–2020s',
    caption_short: `${form.surname.value} / ${form.position.value} / ${form.school_years.value}`,
    notes: form.notes.value
  }));
  fd.append('child_file', form.child_file.files[0]);
  fd.append('adult_file', form.adult_file.files[0]);

  const res = await fetch('/api/projects', { method: 'POST', body: fd });
  const data = await res.json();
  if (!res.ok) {
    status.textContent = JSON.stringify(data);
    return;
  }
  status.textContent = `Создан проект: ${data.id}`;
  document.getElementById('gen-project-id').value = data.id;
  await loadProjects();
}

async function startGeneration() {
  const out = document.getElementById('generation-output');
  const projectId = document.getElementById('gen-project-id').value.trim();
  if (!projectId) {
    out.textContent = 'Сначала выбери проект.';
    return;
  }
  const payload = {
    project_id: projectId,
    decades: document.getElementById('decades').value.split(',').map(x => x.trim()).filter(Boolean),
    image_provider: document.getElementById('image-provider').value,
    video_provider: document.getElementById('video-provider').value,
    render_cards: true,
    create_video: true
  };
  out.textContent = 'Ставлю production pipeline в очередь...';
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  out.textContent = JSON.stringify(data, null, 2);
  await loadProjects();
}

async function refreshSelectedProject() {
  const projectId = document.getElementById('gen-project-id').value.trim();
  if (!projectId) return;
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`);
  const data = await res.json();
  document.getElementById('generation-output').textContent = JSON.stringify({
    id: data.id,
    status: data.status,
    stills: data.assets?.stills || {},
    cards: data.assets?.cards || {},
    video: data.assets?.video || null,
    recent_diagnostics: (data.diagnostics || []).slice(-8)
  }, null, 2);
  await loadProjects();
}

async function refreshVideoStatus() {
  const projectId = document.getElementById('gen-project-id').value.trim();
  if (!projectId) return;
  const out = document.getElementById('generation-output');
  out.textContent = 'Проверяю Seedance...';
  const res = await fetch(`/api/video/${encodeURIComponent(projectId)}/status`);
  const data = await res.json();
  out.textContent = JSON.stringify(data, null, 2);
  await loadProjects();
}

document.getElementById('project-form').addEventListener('submit', createProject);
loadHealth();
loadProjects();
