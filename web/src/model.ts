// Compatibility entry for the existing Web editor and project consumers.
export * from '../../shared/dist/domain/model.js';
import { createProject as create } from '../../shared/dist/domain/model.js';
export function createProject(name = 'Untitled shader') {
  return create(name, { ids: { next: () => crypto.randomUUID() }, clock: { nowISO: () => new Date().toISOString() } });
}
