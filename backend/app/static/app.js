async function loadProjects() {
  const res = await fetch('/api/projects');
  const data = await res.json();
  const container = document.getElementById('projects');
  container.innerHTML = '';
  for (const item of data.items || []) {
    const el = document.createElement('div');
    el.className = 'project-item';
    el.innerHTML = `
      <strong>${item.project_name}</strong><br>
      <small>${item.id}</small><br>
      <small>${item.person?.surname || ''} ${item.person?.name || ''} — ${item.person?.position || ''}</small><br>
      <small>Статус: ${item.status}</small>
    `;
    el.onclick = () => { document.getElementById('gen-project-id').value = item.id; };
    container.appendChild(el);
  }
}

async function createProject(e) {
  e.preventDefault();
  const form = e.target;
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
  document.getElementById('create-status').textContent = `Создан проект: ${data.id}`;
  document.getElementById('gen-project-id').value = data.id;
  await loadProjects();
}

async function startGeneration() {
  const payload = {
    project_id: document.getElementById('gen-project-id').value,
    decades: document.getElementById('decades').value.split(',').map(x => x.trim()).filter(Boolean),
    image_provider: document.getElementById('image-provider').value,
    video_provider: document.getElementById('video-provider').value,
    render_cards: true,
    create_video: true
  };
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  document.getElementById('generation-output').textContent = JSON.stringify(data, null, 2);
  await loadProjects();
}

document.getElementById('project-form').addEventListener('submit', createProject);
loadProjects();
