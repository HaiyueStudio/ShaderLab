import type { MobileSession } from '../session';
import {languageOf} from '../../../shared/dist/domain/sourceLanguage.js';

/** Compilation/playback notifications do not require native document writes. */
export function observeEditorDocument(session: MobileSession, ports: {
  showSource(): void;
  renderChannels(): void;
  syncSource(source: string): void;
  title(name: string): void;
  draft(): void;
}): () => void {
  let previous = session.application.state, source = session.source;
  return session.application.subscribe(() => {
    const next = session.application.state;
    if (previous.project === next.project && previous.session === next.session && previous.activePass === next.activePass) return;
    const old = previous, oldSource = source;
    previous = next; source = session.source;
    // Commit the observed state before callbacks, which may notify reentrantly.
    if (old.activePass !== next.activePass || old.session !== next.session || languageOf(old.project,old.activePass)!==session.language) {
      ports.showSource(); ports.renderChannels();
    } else if (oldSource !== source) ports.syncSource(source);
    if (old.project.name !== next.project.name) ports.title(next.project.name);
    if (old.revision !== next.revision) ports.draft();
  });
}
