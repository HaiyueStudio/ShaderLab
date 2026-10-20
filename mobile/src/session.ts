import { ShaderApplication, selectors } from '../../shared/dist/application/application.js';
import { detectShaderLanguage } from '../../shared/dist/domain/sourceLanguage.js';
import type { ShaderEnvironment } from '../../shared/dist/ports/services.js';
import type { ShaderProject, CodeId, ShaderLanguage, RenderPassId, Channel } from '../../shared/dist/domain/model.js';

/** Compatibility facade: all document state and commands belong to the shared application. */
export class MobileSession {
    readonly application: ShaderApplication;
    autoDetect = true;
    constructor(environment: ShaderEnvironment = { ids: { next: () => crypto.randomUUID() }, clock: { nowISO: () => new Date().toISOString() } }) {
        this.application = new ShaderApplication(environment);
    }
    get project() { return this.application.state.project as ShaderProject; }
    get pass() { return this.application.state.activePass; }
    set pass(pass: CodeId) { this.application.dispatch({ type: 'pass.select', pass }); }
    get revision() { return this.application.state.revision; }
    get savedRevision() { return this.application.state.savedRevision; }
    get dirty() { return selectors.dirty(this.application.state); }
    get language() { return selectors.language(this.application.state); }
    get source() { return selectors.source(this.application.state); }
    get tabs() { return selectors.tabs(this.application.state); }
    open(project: ShaderProject, fork = false) { this.application.dispatch({ type: 'project.open', project, fork }); }
    /** Kept for the G01 replay; production adapters use change/actions. */
    changed() { this.application.change(() => {}); }
    setSource(source: string, language = this.language) { this.application.setSource(this.pass, source, language); }
    paste(text: string) { this.setSource(text, this.autoDetect ? detectShaderLanguage(text, this.language) ?? this.language : this.language); }
    switchLanguage(language: ShaderLanguage) { this.application.switchLanguage(this.pass, language); }
    add(pass: CodeId) { this.application.dispatch({ type: 'pass.add', pass }); }
    channel(index: number, channel: Channel) { if (this.pass !== 'common') this.application.dispatch({ type: 'channel.set', pass: this.pass, index, channel }); }
    enable(pass: RenderPassId, enabled: boolean) { if (pass !== 'image') this.application.dispatch({ type: 'pass.enable', pass, enabled }); }
}
