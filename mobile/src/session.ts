import { createProject, codeTabs, passOf, revealCodeTab, validateProject, type ShaderProject, type CodeId, type ShaderLanguage, type RenderPassId, type Channel } from '../../web/dist/model.js';
import { languageOf, sourceOf, defaultGlsl } from '../../web/dist/sourceLanguage.js';
import { detectShaderLanguage } from '../../web/dist/sourceLanguage.js';
/** Both platforms edit the identical portable .hyshader v1 document. */
export class MobileSession {
    project: ShaderProject = createProject();
    pass: CodeId = 'image';
    revision = 0;
    savedRevision = 0;
    autoDetect = true;
    get dirty() { return this.revision !== this.savedRevision; }
    get language() { return languageOf(this.project, this.pass); }
    get source() { return sourceOf(this.project, this.pass); }
    get tabs() { return codeTabs(this.project); }
    open(project: ShaderProject, fork = false) {
        this.project = validateProject(structuredClone(project));
        if (fork)
            this.project.id = crypto.randomUUID();
        this.pass = 'image';
        this.revision++;
        this.savedRevision = this.revision;
    }
    changed() { this.project.updatedAt = new Date().toISOString(); this.revision++; }
    setSource(text: string, language = this.language) {
        if (text === this.source && language === this.language)
            return;
        if (text.length > 100000)
            throw Error('单个页签最多 100 KB。');
        this.project.editorLanguages = { ...this.project.editorLanguages, [this.pass]: language };
        if (this.pass === 'common') {
            if (language === 'glsl')
                this.project.commonGlsl = text;
            else
                this.project.common = text;
        }
        else {
            const p = passOf(this.project, this.pass);
            if (language === 'glsl')
                p.glsl = text;
            else
                p.code = text;
        }
        this.changed();
    }
    paste(text: string) { this.setSource(text, this.autoDetect ? detectShaderLanguage(text) ?? this.language : this.language); }
    switchLanguage(language: ShaderLanguage) {
        if (language === this.language)
            return;
        const text = this.pass === 'common' ? language === 'glsl' ? this.project.commonGlsl ?? '' : this.project.common
            : language === 'glsl' ? passOf(this.project, this.pass).glsl ?? defaultGlsl(this.pass) : passOf(this.project, this.pass).code;
        this.setSource(text, language);
    }
    add(pass: CodeId) {
        revealCodeTab(this.project, pass);
        if (pass !== 'common')
            passOf(this.project, pass).enabled = true;
        this.pass = pass;
        this.changed();
    }
    channel(index: number, channel: Channel) {
        if (this.pass === 'common')
            return;
        if (channel.kind === 'buffer') {
            passOf(this.project, channel.pass).enabled = true;
            revealCodeTab(this.project, channel.pass);
        }
        passOf(this.project, this.pass).channels[index] = channel;
        this.changed();
    }
    enable(pass: RenderPassId, enabled: boolean) {
        if (pass === 'image')
            return;
        passOf(this.project, pass).enabled = enabled;
        if (!enabled)
            for (const p of [...this.project.passes, this.project.sound])
                p.channels = p.channels.map(c => c.kind === 'buffer' && c.pass === pass ? { kind: 'none' } : c);
        this.changed();
    }
}
