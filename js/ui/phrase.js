// Onde as frases-gatilho aparecem: discretas, em sítios diferentes de cada ecrã.
import { prefs } from '../prefs.js';
import { todayKey } from '../engine/dates.js';
import { trigger } from '../engine/phrases.js';
import { esc } from './dom.js';

export function line(slot) {
  if (!prefs.mostrarFrases) return '';
  return trigger(todayKey(), { slot, custom: prefs.frases || [] });
}

/** Linha em "sussurro" no fim de um ecrã. */
export function whisper(slot) {
  const t = line(slot);
  return t ? `<p class="whisper">— ${esc(t)}</p>` : '';
}
