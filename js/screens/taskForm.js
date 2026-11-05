// Bottom sheet para criar/editar uma missão pontual ou um hábito.
import { state, saveTask, deleteTask } from '../state.js';
import { DIFFICULTY, DIFFICULTY_ORDER } from '../engine/xp.js';
import { todayKey } from '../engine/dates.js';
import { esc, el } from '../ui/dom.js';
import { openSheet, actionSheet } from '../ui/sheet.js';
import { toast } from '../ui/effects.js';

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export function openTaskForm(existing = null) {
  const r = existing?.recorrencia || {};
  const f = {
    titulo: existing?.titulo || '',
    tipo: existing?.tipo || 'pontual',
    areaId: existing?.areaId || state.areas[0]?.id,
    dificuldade: existing?.dificuldade || 'media',
    data: existing?.data || todayKey(),
    freq: r.tipo || 'diario',
    dias: r.dias ? [...r.dias] : [1, 2, 3, 4, 5],
    n: r.n || 3,
  };

  const form = el(`
    <form class="form" novalidate autocomplete="off">
      <div class="group">
        <div class="cell"><input name="titulo" type="text" maxlength="80" enterkeyhint="done"
          placeholder="Ex.: 30 min de leitura" value="${esc(f.titulo)}" aria-label="Nome"></div>
      </div>

      <div class="group-header">Tipo</div>
      <div class="pad">
        <div class="segmented" data-field="tipo">
          <button type="button" data-v="pontual">Missão</button>
          <button type="button" data-v="habito">Hábito</button>
        </div>
      </div>

      <div class="group-header">Área</div>
      <div class="chips" data-field="areaId">
        ${state.areas.map((a) => `<button type="button" class="chip" data-v="${esc(a.id)}" style="--area:${esc(a.cor)}"><span>${esc(a.icone)}</span>${esc(a.nome)}</button>`).join('')}
      </div>

      <div class="group-header">Dificuldade</div>
      <div class="diff-grid" data-field="dificuldade">
        ${DIFFICULTY_ORDER.map((k) => `<button type="button" data-v="${k}"><strong>${DIFFICULTY[k].label}</strong><small>${DIFFICULTY[k].xp} XP</small></button>`).join('')}
      </div>

      <div data-show="pontual">
        <div class="group-header">Quando</div>
        <div class="group">
          <label class="cell"><span class="cell-label">Data</span><input type="date" name="data" value="${esc(f.data)}" required></label>
        </div>
      </div>

      <div data-show="habito">
        <div class="group-header">Frequência</div>
        <div class="pad">
          <div class="segmented" data-field="freq">
            <button type="button" data-v="diario">Todos os dias</button>
            <button type="button" data-v="dias">Dias</button>
            <button type="button" data-v="xPorSemana">X / semana</button>
          </div>
        </div>
        <div class="pad weekdays" data-show-freq="dias">
          ${WEEKDAYS.map((d, i) => `<button type="button" class="wd" data-d="${i + 1}" aria-label="${d}">${d}</button>`).join('')}
        </div>
        <div class="group stepper-group" data-show-freq="xPorSemana">
          <div class="cell">
            <span class="cell-label"><b class="n-val">${f.n}</b> vezes por semana</span>
            <div class="stepper">
              <button type="button" data-step="-1" aria-label="Menos">−</button>
              <button type="button" data-step="1" aria-label="Mais">+</button>
            </div>
          </div>
        </div>
      </div>

      <div class="form-actions">
        <button type="submit" class="btn-primary">${existing ? 'Guardar' : f.tipo === 'habito' ? 'Criar hábito' : 'Criar missão'}</button>
        ${existing ? '<button type="button" class="btn-destructive" data-action="delete">Apagar</button>' : ''}
      </div>
    </form>`);

  const sync = () => {
    form.querySelectorAll('[data-field]').forEach((group) => {
      const v = f[group.dataset.field];
      group.querySelectorAll('[data-v]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
    });
    form.querySelectorAll('[data-show]').forEach((s) => (s.hidden = s.dataset.show !== f.tipo));
    form.querySelectorAll('[data-show-freq]').forEach((s) => (s.hidden = s.dataset.showFreq !== f.freq));
    form.querySelectorAll('.wd').forEach((b) => b.setAttribute('aria-pressed', String(f.dias.includes(+b.dataset.d))));
    form.querySelector('.n-val').textContent = f.n;
    if (!existing) form.querySelector('[type=submit]').textContent = f.tipo === 'habito' ? 'Criar hábito' : 'Criar missão';
  };

  form.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-field] [data-v]');
    if (opt) {
      f[opt.closest('[data-field]').dataset.field] = opt.dataset.v;
      return sync();
    }
    const wd = e.target.closest('.wd');
    if (wd) {
      const d = +wd.dataset.d;
      f.dias = f.dias.includes(d) ? f.dias.filter((x) => x !== d) : [...f.dias, d].sort();
      return sync();
    }
    const st = e.target.closest('[data-step]');
    if (st) {
      f.n = Math.min(7, Math.max(1, f.n + +st.dataset.step));
      return sync();
    }
  });

  const sheet = openSheet({ title: existing ? 'Editar' : 'Nova missão', body: form, size: 'large' });
  sync();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const titleInput = form.elements.titulo;
    f.titulo = titleInput.value.trim();
    f.data = form.elements.data.value || todayKey();
    if (!f.titulo) {
      titleInput.closest('.group').classList.remove('shake');
      void titleInput.offsetWidth;
      titleInput.closest('.group').classList.add('shake');
      titleInput.focus();
      return;
    }
    if (f.tipo === 'habito' && f.freq === 'dias' && f.dias.length === 0) {
      toast('Escolhe pelo menos um dia');
      return;
    }
    const task = {
      ...(existing || {}),
      titulo: f.titulo,
      tipo: f.tipo,
      areaId: f.areaId,
      dificuldade: f.dificuldade,
    };
    if (f.tipo === 'pontual') {
      task.data = f.data;
      delete task.recorrencia;
    } else {
      task.recorrencia = f.freq === 'dias' ? { tipo: 'dias', dias: f.dias } : f.freq === 'xPorSemana' ? { tipo: 'xPorSemana', n: f.n } : { tipo: 'diario' };
      delete task.data;
    }
    await saveTask(task);
    sheet.close('saved');
    toast(existing ? 'Guardado' : f.tipo === 'habito' ? 'Hábito criado' : 'Missão criada', { icon: '✓' });
  });

  form.querySelector('[data-action=delete]')?.addEventListener('click', async () => {
    if (await confirmDelete(existing)) {
      sheet.close('deleted');
    }
  });
}

export async function confirmDelete(task) {
  const ok = await actionSheet({
    title: `Apagar "${task.titulo}"?`,
    message: 'O XP que já ganhaste com esta missão fica guardado.',
    actions: [{ label: task.tipo === 'habito' ? 'Apagar hábito' : 'Apagar missão', destructive: true, value: true }],
  });
  if (!ok) return false;
  await deleteTask(task.id);
  toast('Apagado');
  return true;
}
