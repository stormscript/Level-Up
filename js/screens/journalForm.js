// Bottom sheet de escrita no diário (uma entrada por dia, guarda sozinho).
import { journalOn, saveJournal } from '../state.js';
import { capsDate, formatRelative, todayKey } from '../engine/dates.js';
import { journalPrompt } from '../engine/phrases.js';
import { esc, el } from '../ui/dom.js';
import { openSheet } from '../ui/sheet.js';

export const MOODS = [
  { v: 1, label: 'Pesado' },
  { v: 2, label: 'Em baixo' },
  { v: 3, label: 'Neutro' },
  { v: 4, label: 'Bem' },
  { v: 5, label: 'Imparável' },
];

/** Barras de humor (estilo equalizador). */
export function moodBars(v, { small = false } = {}) {
  return `<span class="mood-bars ${small ? 'small' : ''}" aria-label="Humor ${v || '—'} de 5">${[1, 2, 3, 4, 5]
    .map((i) => `<i class="${i <= (v || 0) ? 'on' : ''}" style="--h:${i}"></i>`)
    .join('')}</span>`;
}

export function openJournal(date = todayKey()) {
  const existing = journalOn(date);
  const entry = {
    data: date,
    humor: existing?.humor || 0,
    texto: existing?.texto || '',
    pergunta: existing?.pergunta || journalPrompt(date),
  };

  const body = el(`
    <div class="journal-form">
      <div class="caps">${esc(capsDate(date))}</div>
      <div class="group-header flush">Como estás</div>
      <div class="moods" role="radiogroup">
        ${MOODS.map((m) => `<button type="button" class="mood" data-v="${m.v}" role="radio" aria-checked="false">${moodBars(m.v, { small: true })}<span>${m.label}</span></button>`).join('')}
      </div>
      <p class="prompt">${esc(entry.pergunta)}</p>
      <textarea name="texto" rows="8" placeholder="Escreve. Ninguém vai ler." aria-label="Texto do diário">${esc(entry.texto)}</textarea>
      <p class="saved-hint" aria-live="polite"></p>
    </div>`);

  const textarea = body.querySelector('textarea');
  const hint = body.querySelector('.saved-hint');

  const syncMood = () =>
    body.querySelectorAll('.mood').forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.v === entry.humor)));
  syncMood();

  let timer;
  const save = async () => {
    clearTimeout(timer);
    entry.texto = textarea.value;
    await saveJournal({ ...entry });
    hint.textContent = entry.texto.trim() || entry.humor ? 'Guardado ✦' : '';
  };
  const saveSoon = () => {
    hint.textContent = '';
    clearTimeout(timer);
    timer = setTimeout(save, 700);
  };

  body.addEventListener('click', (e) => {
    const m = e.target.closest('.mood');
    if (!m) return;
    entry.humor = entry.humor === +m.dataset.v ? 0 : +m.dataset.v;
    syncMood();
    save();
  });
  textarea.addEventListener('input', () => {
    autosize();
    saveSoon();
  });
  const autosize = () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(220, textarea.scrollHeight)}px`;
  };

  const title = formatRelative(date) === 'Hoje' ? 'Diário de hoje' : `Diário · ${formatRelative(date)}`;
  openSheet({ title, body, leftLabel: 'Fechar', size: 'large', onClose: save });
  requestAnimationFrame(autosize);
}
