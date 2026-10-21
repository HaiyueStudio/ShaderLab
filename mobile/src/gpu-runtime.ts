import { HaiyueEngine, Entity, Camera3D, CartesianTransform3D, SphericalTransform3D, OrbitControl, BasicMaterial, Mesh3D, createSphere3D, createBox3D } from '@haiyue/engine';
import { createTorus3D } from '@haiyue/engine/geometry';
import { NativeVideo } from './video';
import { openCamera } from './camera';
import { LiveCamera } from '../../shared/dist/ports/liveCamera.js';
import { ImageAsset } from '@nativescript/canvas';
import { ImageSource, knownFolders, path } from '@nativescript/core';
import { NativeCanvasTextures } from '@haiyue/native/engine';
import { FrameRate } from '../../shared/dist/views/frame-rate.js';
import { validateProject, usesCurrentFrame, CUBE_FACES, cameraFacing, type ShaderProject, type ShaderPass, type BufferId, type PassId, type ShaderDiagnostic, type PreviewMode, type PreviewMesh } from './project';
import { refreshProjectSources } from '../../web/src/sourceProject.js';
import type { HlslTranslator } from '../../web/src/hlslTypes.js';
import type { WgslTranslator } from '../../web/src/sourceCommon.js';
import { resolveChannelBindings } from '../../web/src/channelBindings.js';
import { PRESENT, wrapShader } from '../../web/src/shaders.js';
import { builtinTexture } from '../../shared/dist/domain/builtinTextures.js';
import { KeyboardState } from '../../web/src/keyboardTexture.js';
import { createSoundRenderer, SoundCompileError, type SoundRenderer } from '../../web/src/sound.js';
type Texture = {
    texture: GPUTexture;
    view: GPUTextureView;
    width: number;
    height: number;
};
type Pipeline = {
    pass: ShaderPass;
    pipeline: GPURenderPipeline;
    layout: GPUBindGroupLayout;
    dimensions: ('2d' | 'cube')[];
    uniform: GPUBuffer;
    group: GPUBindGroup;
};
type PipelineCache = { code: string; common: string; dimensions: string; layout: GPUBindGroupLayout; pipeline: GPURenderPipeline; diagnostics: ShaderDiagnostic[] };
type InputBinding = { views: GPUTextureView[]; group: GPUBindGroup };
export type Prepared = {
    generation: number;
    project: ShaderProject;
    passes: Pipeline[];
    images: Map<string, Texture>;
    videos: Map<string, NativeVideo>;
    soundInputs?: Texture[];
    sound?: SoundRenderer;
    diagnostics: ShaderDiagnostic[];
};
export class NativeCompileError extends Error {
    constructor(readonly diagnostics: ShaderDiagnostic[]) { super(diagnostics.map(d => `${d.pass}:${d.line}:${d.column} ${d.message}`).join('\n')); }
}
/** Product-owned shader graph. Rendering, devices, surface presentation and
 * lifecycle belong to @haiyue/native/engine; no browser DOM is installed. */
/** Optional product experiment: reuse the same shader graph on a GUI texture.
 * It never changes the standalone native editor's presentation path. */
export interface EmbeddedShaderPreview {
    size(): {width:number;height:number};
    output(texture:GPUTexture):void;
}
export class NativeShaderRuntime {
    private active?: Prepared;
    private readonly pipelineCache = new Map<PassId, PipelineCache>();
    private cameraTexture?: Texture;
    private cameraTime = 0;
    private captureVisible = true;
    private cameraInput = new LiveCamera(openCamera, () => { this.dirty = true; this.requestFrame(); }, message => this.onCameraError?.(message));
    onCameraError?: (message: string) => void;
    private generation = 0;
    private targets = new Map<PassId, [
        Texture,
        Texture
    ]>();
    private current = 0;
    private width = 0;
    private height = 0;
    private frame = 0;
    private time = 0;
    private dirty = true;
    private stepPending = false;
    private sampler!: GPUSampler;
    private frameLayout!: GPUBindGroupLayout;
    private emptyLayout!: GPUBindGroupLayout;
    private emptyGroup!: GPUBindGroup;
    private presenter!: GPURenderPipeline;
    private presentSize!: GPUBuffer;
    // Bounded ping-pong caches: reused views keep their bindings; resizing or
    // replacing a video/camera texture replaces the corresponding slot.
    private inputBindings = new WeakMap<Pipeline, (InputBinding | undefined)[]>();
    private presentBindings = new WeakMap<GPUTextureView, GPUBindGroup>();
    private readonly uniformData = new Float32Array(36);
    private readonly presentData = new Float32Array(4);
    private readonly noOffsets = new Uint32Array(0);
    private black!: Texture;
    private cube!: Texture;
    private keys!: Texture;
    readonly keyboard = new KeyboardState();
    private mouse = [0, 0, 0, 0];
    private touchId: number | null = null;
    private camera = new SphericalTransform3D({ radius: 3.6, theta: .45, phi: 1.25 });
    private material = new BasicMaterial({ blending: 'none' });
    private mesh!: Mesh3D;
    private scene!: ReturnType<HaiyueEngine['createScene']>;
    private orbit?: OrbitControl;
    private geometry = { sphere: createSphere3D({ radius: 1, widthSegments: 40, heightSegments: 24 }), box: createBox3D({ width: 1.6, height: 1.6, depth: 1.6 }), torus: createTorus3D({ radius: .85, tube: .32, radialSegments: 24, tubularSegments: 40 }) };
    private dead = false;
    playing = true;
    mode: PreviewMode = 'canvas';
    viewed: PassId = 'image';
    readonly bufferFormat: 'rgba32float' | 'rgba16float';
    onFrame?: () => void;
    private frameRate = new FrameRate();
    /** Baseline switch for controlled experiments; production keeps reuse enabled. */
    optimizeFrameWork = true;
    private keyboardVersion = -1;
    private presentedWidth = -1;
    private presentedHeight = -1;
    private uploadKeyboard() {
        const version = this.keyboard.version;
        if (this.optimizeFrameWork && version === this.keyboardVersion) return false;
        this.device.queue.writeTexture({ texture: this.keys.texture }, this.keyboard.pixels(), { bytesPerRow: 1024 }, [256, 3]);
        this.keyboardVersion = version;
        return true;
    }
    private updatePresentSize() {
        const width = this.engine.width, height = this.engine.height;
        if (this.optimizeFrameWork && width === this.presentedWidth && height === this.presentedHeight) return false;
        this.presentData[0] = width; this.presentData[1] = height;
        this.device.queue.writeBuffer(this.presentSize, 0, this.presentData);
        this.presentedWidth = width; this.presentedHeight = height;
        return true;
    }
    private submitCommands(encoder: GPUCommandEncoder) { this.device.queue.submit([encoder.finish()]); }

    constructor(readonly engine: HaiyueEngine, readonly requestFrame: () => void, private readonly orbitTarget: HTMLCanvasElement, private readonly hlsl?: HlslTranslator, private readonly embedded?: EmbeddedShaderPreview, private readonly wgsl?: WgslTranslator) { this.bufferFormat = engine.device.features.has('float32-filterable') ? 'rgba32float' : 'rgba16float'; }
    private get device() { return this.engine.device; }
    async initialize() {
        const d = this.device;
        this.sampler = d.createSampler({ minFilter: 'linear', magFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat' });
        this.frameLayout = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform', minBindingSize: 144 } }] });
        this.emptyLayout = d.createBindGroupLayout({ entries: [] });
        this.emptyGroup = d.createBindGroup({ layout: this.emptyLayout, entries: [] });
        this.black = this.texture(1, 1, 'rgba8unorm');
        d.queue.writeTexture({ texture: this.black.texture }, new Uint8Array([0, 0, 0, 255]), {}, [1, 1]);
        this.cube = this.texture(1, 1, 'rgba8unorm', true);
        for (let z = 0; z < 6; z++)
            d.queue.writeTexture({ texture: this.cube.texture, origin: [0, 0, z] }, new Uint8Array([0, 0, 0, 255]), {}, [1, 1]);
        this.keys = this.texture(256, 3, 'rgba8unorm');
        const module = d.createShaderModule({ code: PRESENT });
        this.presenter = await d.createRenderPipelineAsync({ layout: 'auto', vertex: { module, entryPoint: 'hy_vertex' }, fragment: { module, entryPoint: 'hy_present', targets: [{ format: this.engine.format }] }, primitive: { topology: 'triangle-list' } });
        this.presentSize = d.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        const camera = new Entity('ShaderLab camera').addComponent(this.camera).addComponent(new Camera3D({ near: .05, far: 100, fov: Math.PI / 4 }));
        this.scene = this.engine.createScene({ camera, render3D: true, render2D: false, gui: false, view: { clearColor: this.engine.clearColor } });
        this.mesh = new Mesh3D(this.geometry.sphere, this.material);
        this.scene.add(new Entity('ShaderLab material').addComponent(new CartesianTransform3D()).addComponent(this.mesh));
        this.engine.switchScene(null);
        this.engine.on('update', ({ detail }) => this.render(detail.delta / 1000));
    }
    private texture(width: number, height: number, format: GPUTextureFormat, cube = false): Texture { const texture = this.device.createTexture({ size: [width, height, cube ? 6 : 1], format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC }); return { texture, view: texture.createView({ dimension: cube ? 'cube' : '2d' }), width, height }; }
    private async image(source: string): Promise<{
        width: number;
        height: number;
        pixels: Uint8Array;
    }> {
        const image = new ImageAsset();
        if (source.startsWith('data:image/')) {
            const decoded = ImageSource.fromBase64Sync(source.slice(source.indexOf(',') + 1));
            if (!decoded)
                throw Error('无法解码图片');
            if (!image.loadFromNativeSync(decoded.ios ?? decoded.android))
                throw Error('图片原生解码失败');
        }
        else {
            await image.fromFile(source);
        }
        const width = Number(image.width), height = Number(image.height);
        if (!width || !height || Math.max(width, height) > 4096)
            throw Error('无效图片尺寸，最大 4096 像素');
        const raster = new NativeCanvasTextures(this.device);
        const canvas = raster.createCanvas2D(width, height);
        const ctx = canvas.getContext('2d');
        if (!ctx)
            throw Error('原生图片读取不可用');
        ctx.drawImage(image as unknown as CanvasImageSource, 0, 0);
        const pixels = raster.readAtlasPixels(canvas).slice();
        raster.dispose();
        return { width, height, pixels };
    }
    async prepare(project: ShaderProject): Promise<Prepared> {
        let snapshot: ShaderProject;
        try { snapshot = validateProject(project); }
        catch (error) {
            // An invalid newer request must still invalidate older prepared work.
            ++this.generation; throw error;
        }
        return this.prepareOwnedSnapshot(snapshot);
    }
    /** Internal ownership hand-off from ShaderApplication's independent,
     * normalized compile snapshot. The caller must not reuse this snapshot.
     * External/imported projects must use prepare(), which validates and copies. */
    async prepareOwnedSnapshot(snapshot: ShaderProject): Promise<Prepared> {
        const generation = ++this.generation;
        const next: Prepared = { generation, project: snapshot, passes: [], images: new Map(), videos: new Map(), diagnostics: await refreshProjectSources(snapshot, this.hlsl, this.wgsl) };
        if (next.diagnostics.length)
            throw new NativeCompileError(next.diagnostics);
        try {
            for (const pass of snapshot.passes.filter(p => p.enabled)) {
                const binding = resolveChannelBindings(pass, snapshot.common);
                next.diagnostics.push(...binding.diagnostics);
                if (binding.diagnostics.some(d => d.severity === 'error'))
                    continue;
                if (pass.id !== 'image' && this.bufferFormat === 'rgba16float')
                    next.diagnostics.push({ pass: pass.id, severity: 'warning', line: 1, column: 1, message: '设备未启用 32 位浮点过滤，反馈使用 16 位格式。依赖高精度历史数据的效果可能不同。' });
                // Resolution changes need new targets, not another shader module
                // or pipeline. Keep only the latest successful variant per pass.
                const dimensionsKey = binding.dimensions.join(','), cached = this.pipelineCache.get(pass.id);
                if (cached && cached.code === pass.code && cached.common === snapshot.common && cached.dimensions === dimensionsKey) {
                    next.diagnostics.push(...cached.diagnostics.map(d => ({ ...d })));
                    const uniform = this.device.createBuffer({ size: 144, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
                    next.passes.push({ pass, pipeline: cached.pipeline, layout: cached.layout, dimensions: binding.dimensions, uniform, group: this.device.createBindGroup({ layout: this.frameLayout, entries: [{ binding: 0, resource: { buffer: uniform } }] }) });
                    continue;
                }
                const diagnosticStart = next.diagnostics.length;
                const layout = this.device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } }, ...binding.dimensions.map((viewDimension, i) => ({ binding: i + 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' as const, viewDimension } }))] });
                const wrapped = wrapShader(pass, snapshot.common);
                this.device.pushErrorScope('validation');
                const module = this.device.createShaderModule({ label: 'ShaderLab.' + pass.id, code: wrapped.code });
                const scope = this.device.popErrorScope();
                const info = await module.getCompilationInfo(), error = await scope;
                next.diagnostics.push(...info.messages.map(m => ({ ...wrapped.sourceLocation(m.lineNum), column: m.linePos || 1, severity: m.type, message: m.message })));
                if (error && !info.messages.some(m => m.type === 'error'))
                    next.diagnostics.push({ pass: pass.id, severity: 'error', line: 1, column: 1, message: error.message });
                if (error || info.messages.some(m => m.type === 'error'))
                    continue;
                try {
                    const pipeline = await this.device.createRenderPipelineAsync({ layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.frameLayout, this.emptyLayout, layout] }), vertex: { module, entryPoint: 'hy_vertex' }, fragment: { module, entryPoint: 'hy_fragment', targets: [{ format: pass.id === 'image' ? 'rgba8unorm' : this.bufferFormat }] }, primitive: { topology: 'triangle-list' } });
                    const uniform = this.device.createBuffer({ size: 144, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
                    next.passes.push({ pass, pipeline, layout, dimensions: binding.dimensions, uniform, group: this.device.createBindGroup({ layout: this.frameLayout, entries: [{ binding: 0, resource: { buffer: uniform } }] }) });
                    if (!this.dead && generation === this.generation) this.pipelineCache.set(pass.id, { code: pass.code, common: snapshot.common, dimensions: dimensionsKey, layout, pipeline, diagnostics: next.diagnostics.slice(diagnosticStart).map(d => ({ ...d })) });
                }
                catch (error) {
                    next.diagnostics.push({ pass: pass.id, severity: 'error', line: 1, column: 1, message: String(error) });
                }
            }
            if (next.diagnostics.some(d => d.severity === 'error'))
                throw new NativeCompileError(next.diagnostics);
            const enabled = [...snapshot.passes, snapshot.sound].filter(p => p.enabled), channels = enabled.flatMap(p => p.channels);
            const used = new Set(channels.flatMap(c => c.kind === 'image' || c.kind === 'cubemap' || c.kind === 'video' ? [c.assetId] : []));
            const sources = [...snapshot.assets.filter(a => used.has(a.id)), ...new Set(channels.flatMap(c => c.kind === 'builtin' ? [c.texture] : []))].map(source => typeof source === 'string' ? { id: 'builtin:' + source, dataUrl: path.join(knownFolders.currentApp().path, 'assets', builtinTexture(source).file), kind: 'image' as const } : source);
            for (const source of sources) {
                if (source.kind === 'video') {
                    const video = new NativeVideo(source.dataUrl, source.id + '-' + generation);
                    next.videos.set(source.id, video);
                    this.videoFrame(next, source.id, video, 0);
                    continue;
                }
                const faces = source.kind === 'cubemap' ? await Promise.all(CUBE_FACES.map(face => this.image(source.faces[face]))) : [await this.image(source.dataUrl)];
                const first = faces[0]!;
                if (source.kind === 'cubemap' && first.width !== first.height)
                    throw Error('立方体贴图需为正方形');
                const texture = this.texture(first.width, first.height, 'rgba8unorm', source.kind === 'cubemap');
                next.images.set(source.id, texture);
                faces.forEach((face, z) => { if (face.width !== first.width || face.height !== first.height)
                    throw Error('立方体贴图六面尺寸不一致'); this.device.queue.writeTexture({ texture: texture.texture, origin: [0, 0, z] }, face.pixels, { bytesPerRow: face.width * 4 }, [face.width, face.height]); });
            }
            if (snapshot.sound.enabled) {
                const inputs = this.inputs(next, snapshot.sound, 0, resolveChannelBindings(snapshot.sound, snapshot.common).dimensions);
                next.soundInputs = inputs;
                next.sound = await createSoundRenderer(this.device, snapshot, inputs, this.sampler);
            }
            return next;
        }
        catch (error) {
            this.release(next);
            if (error instanceof SoundCompileError)
                throw new NativeCompileError(error.diagnostics);
            throw error;
        }
    }
    commit(next: Prepared) {
        if (this.dead || next.generation !== this.generation) throw Error('预览会话已失效。');
        const old = this.active;
        if (!old || cameraFacing(old.project) !== cameraFacing(next.project)) {
            if (this.cameraTexture) { const texture = this.cameraTexture.texture; void this.device.queue.onSubmittedWorkDone().then(() => texture.destroy()); }
            this.cameraTexture = undefined; this.cameraTime = 0;
        }
        this.active = next; this.reset(); this.setMode(next.project.preview.mode, next.project.preview.mesh);
        this.syncCamera();
        if (old) this.release(old);
    }
    releasePrepared(next: Prepared) { this.release(next); }
    /** Compatibility entry for GPU regression tools. Editor uses the shared two-phase flow. */
    async compile(project: ShaderProject) {
        const next = await this.prepare(project);
        if (this.dead || next.generation !== this.generation) { this.release(next); return { stale: true, diagnostics: next.diagnostics }; }
        try { this.commit(next); return { stale: false, diagnostics: next.diagnostics }; }
        catch (error) { this.release(next); throw error; }
    }
    private inputs(prepared: Prepared, pass: {
        id: PassId | 'sound';
        channels: ShaderPass['channels'];
    }, next: number, dimensions: ('2d' | 'cube')[]) { return pass.channels.map((c, i) => c.kind === 'camera' ? this.cameraTexture ?? this.black : c.kind === 'keyboard' ? this.keys : c.kind === 'buffer' ? this.targets.get(c.pass)?.[usesCurrentFrame(pass.id as PassId, c.pass) ? next : this.current] ?? this.black : c.kind === 'builtin' ? prepared.images.get('builtin:' + c.texture) ?? this.black : c.kind === 'image' || c.kind === 'cubemap' || c.kind === 'video' ? prepared.images.get(c.assetId) ?? this.black : dimensions[i] === 'cube' ? this.cube : this.black); }
    private bindInputs(compiled: Pipeline, inputs: Texture[], slot: number): GPUBindGroup {
        let slots = this.inputBindings.get(compiled);
        if (!slots) { slots = []; this.inputBindings.set(compiled, slots); }
        const cached = slots[slot];
        if (cached && inputs.every((input, i) => cached.views[i] === input.view)) return cached.group;
        const views = inputs.map(input => input.view);
        const group = this.device.createBindGroup({ layout: compiled.layout, entries: [{ binding: 0, resource: this.sampler }, ...views.map((view, i) => ({ binding: i + 1, resource: view }))] });
        slots[slot] = { views, group };
        return group;
    }
    private bindOutput(output: Texture): GPUBindGroup {
        let group = this.presentBindings.get(output.view);
        if (!group) {
            group = this.device.createBindGroup({ layout: this.presenter.getBindGroupLayout(0), entries: [{ binding: 0, resource: output.view }, { binding: 1, resource: this.sampler }, { binding: 2, resource: { buffer: this.presentSize } }] });
            this.presentBindings.set(output.view, group);
        }
        return group;
    }
    private videoFrame(prepared: Prepared, id: string, video: NativeVideo, time: number) {
        const image = video.at(time);
        if (!image)
            return;
        prepared.images.set(id, this.uploadFrame(image, prepared.images.get(id)));
    }
    private uploadFrame(image: ImageAsset, target?: Texture): Texture {
        const width = Number(image.width), height = Number(image.height);
        if (!width || !height || Math.max(width, height) > 4096)
            throw Error('视频帧尺寸无效');
        const raster = new NativeCanvasTextures(this.device);
        try {
            const canvas = raster.createCanvas2D(width, height), ctx = canvas.getContext('2d');
            if (!ctx)
                throw Error('原生视频帧读取不可用');
            ctx.drawImage(image as unknown as CanvasImageSource, 0, 0);
            const pixels = raster.readAtlasPixels(canvas);
            if (!target || target.width !== width || target.height !== height) {
                const old = target;
                target = this.texture(width, height, 'rgba8unorm');
                if (old)
                    void this.device.queue.onSubmittedWorkDone().then(() => old.texture.destroy());
            }
            this.device.queue.writeTexture({ texture: target.texture }, pixels, { bytesPerRow: width * 4 }, [width, height]);
            return target;
        }
        finally {
            raster.dispose();
        }
    }
    private resize() { if (!this.active)
        return; const size = this.embedded?.size() ?? {width:this.engine.width,height:this.engine.height}; const scale = this.active.project.preview.scale; const factor = Math.min(scale, 1280 / Math.max(size.width, size.height), Math.sqrt(786432 / (size.width * size.height))); const width = Math.max(1, Math.floor(size.width * factor)), height = Math.max(1, Math.floor(size.height * factor)); if (width === this.width && height === this.height && this.targets.size)
        return; this.clearTargets(); this.width = width; this.height = height; for (const p of this.active.passes)
        this.targets.set(p.pass.id, [this.texture(width, height, p.pass.id === 'image' ? 'rgba8unorm' : this.bufferFormat), this.texture(width, height, p.pass.id === 'image' ? 'rgba8unorm' : this.bufferFormat)]); this.frame = 0; this.time = 0; this.dirty = true; }
    private render(delta: number) {
        if (!this.active || this.dead)
            return;
        this.resize();
        const advance = this.playing || this.stepPending;
        this.stepPending = false;
        let pendingEncoder: GPUCommandEncoder | undefined;
        if (advance || this.dirty) {
            const dt = advance ? Math.min(.1, Math.max(0, delta)) : 0;
            if (this.frame > 0)
                this.time += dt;
            for (const [id, video] of this.active.videos)
                this.videoFrame(this.active, id, video, this.time);
            const camera = this.cameraInput.read();
            if (camera) {
                try { this.cameraTexture = this.uploadFrame(camera.image, this.cameraTexture); this.cameraTime = camera.time; }
                finally { camera.release(); }
            }
            const encoder = this.device.createCommandEncoder();
            this.uploadKeyboard();
            const next = 1 - this.current;
            for (const compiled of this.active.passes) {
                const inputs = this.inputs(this.active, compiled.pass, next, compiled.dimensions), data = this.uniformData;
                data.fill(0);
                data.set([this.width, this.height, 1, this.time, dt, this.frame, dt > 0 ? 1 / dt : 0, 44100]);
                data.set(this.mouse, 8);
                const date = new Date();
                data.set([date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds() + date.getMilliseconds() / 1000], 12);
                inputs.forEach((input, i) => { if (compiled.pass.channels[i]!.kind !== 'none')
                    data.set([input.width, input.height, 1, 0], 16 + i * 4); if (compiled.pass.channels[i]!.kind === 'camera') data[32 + i] = this.cameraTime; if (compiled.pass.channels[i]!.kind === 'video')
                    data[32 + i] = this.time % (this.active!.videos.get((compiled.pass.channels[i] as {
                        assetId: string;
                    }).assetId)?.duration ?? 1); if (compiled.pass.channels[i]!.kind === 'buffer')
                    data[32 + i] = usesCurrentFrame(compiled.pass.id, (compiled.pass.channels[i] as {
                        pass: BufferId;
                    }).pass) ? this.time : Math.max(0, this.time - dt); });
                this.device.queue.writeBuffer(compiled.uniform, 0, data);
                const group = this.bindInputs(compiled, inputs, next);
                const pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.targets.get(compiled.pass.id)![next]!.view, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] });
                pass.setPipeline(compiled.pipeline);
                pass.setBindGroup(0, compiled.group, this.noOffsets, 0, 0);
                pass.setBindGroup(1, this.emptyGroup, this.noOffsets, 0, 0);
                pass.setBindGroup(2, group, this.noOffsets, 0, 0);
                pass.draw(3);
                pass.end();
            }
            // Canvas presentation can follow the graph in the same encoder.
            // Scene/embedded consumers belong to Engine's later submission.
            if (this.optimizeFrameWork && !this.embedded && this.mode === 'canvas') pendingEncoder = encoder;
            else this.submitCommands(encoder);
            this.current = next;
            this.frame++;
            this.dirty = this.keyboard.endFrame();
        }
        const output = this.targets.get(this.viewed)?.[this.current] ?? this.targets.get('image')?.[this.current];
        if (!output) { if (pendingEncoder) this.submitCommands(pendingEncoder); return; }
        if (this.embedded) this.embedded.output(output.texture);
        else if (this.mode === 'scene')
            this.material.texture = output.texture;
        else {
            this.updatePresentSize();
            const group = this.bindOutput(output);
            const encoder = pendingEncoder ?? this.device.createCommandEncoder(), pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.engine.getOutputView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
            pass.setPipeline(this.presenter);
            pass.setBindGroup(0, group, this.noOffsets, 0, 0);
            pass.draw(3);
            pass.end();
            this.submitCommands(encoder);
        }
        if(advance && this.playing && this.captureVisible)this.frameRate.tick(typeof performance==='undefined'?Date.now():performance.now());
        this.onFrame?.();
    }
    setMode(mode: PreviewMode, mesh: PreviewMesh = 'sphere') {
        // Embedded preview belongs to its caller's GUI scene. Compiling a shader
        // must not deactivate that scene as the standalone Canvas route does.
        if(this.embedded){this.mode='canvas';this.requestFrame();return;}
        this.mode = mode; this.orbit?.dispose(); this.orbit = undefined; this.mesh.geometry = this.geometry[mesh]; this.engine.switchScene(mode === 'scene' ? this.scene : null); if (mode === 'scene')
        this.orbit = new OrbitControl(this.orbitTarget, this.camera, { minRadius: 1.8, maxRadius: 12, enablePan: false }); this.requestFrame(); }
    setMSAA(value:boolean) { const samples=value?4:1;this.engine.msaaSamples=samples;this.scene.renderView.sampleCount=samples;this.requestFrame(); }
    touch(action: string, id: number, x: number, y: number, w: number, h: number) { if (action === 'down' && this.touchId === null) {
        this.touchId = id;
        this.mouse = [x / w * this.width, (1 - y / h) * this.height, Math.max(.001, x / w * this.width), Math.max(.001, (1 - y / h) * this.height)];
    }
    else if (this.touchId === id) {
        this.mouse[0] = x / w * this.width;
        this.mouse[1] = (1 - y / h) * this.height;
        if (action === 'up' || action === 'cancel') {
            this.mouse[2] = -Math.abs(this.mouse[2]!);
            this.mouse[3] = -Math.abs(this.mouse[3]!);
            this.touchId = null;
        }
    } this.dirty = true; this.requestFrame(); }
    releaseInput() { this.touchId = null; this.mouse[2] = -Math.abs(this.mouse[2]!); this.mouse[3] = -Math.abs(this.mouse[3]!); this.keyboard.release(); this.dirty = true; }
    private syncCamera() { this.cameraInput.configure(this.active ? cameraFacing(this.active.project) : null, this.playing && this.captureVisible && !this.dead); }
    setCaptureVisible(value: boolean) { if(value!==this.captureVisible)this.frameRate.reset();this.captureVisible = value; this.syncCamera(); }
    setPlaying(value: boolean) { if(value!==this.playing)this.frameRate.reset();this.playing = value; this.syncCamera(); this.requestFrame(); }
    step() { this.setPlaying(false); this.stepPending = true; this.requestFrame(); }
    reset() { this.frameRate.reset();this.frame = 0; this.time = 0; this.keyboard.reset(); this.dirty = true; this.clearTargets(); this.requestFrame(); }
    private clearTargets(immediate = false) { this.inputBindings = new WeakMap(); this.presentBindings = new WeakMap(); const old = [...this.targets.values()].flat().map(t => t.texture); this.targets.clear(); const release = () => old.forEach(t => t.destroy()); if (immediate) release(); else void this.device.queue.onSubmittedWorkDone().then(release); }
    private release(prepared: Prepared, immediate = false) { prepared.sound?.dispose(); for (const video of prepared.videos.values())
        video.dispose(); const buffers = prepared.passes.map(p => p.uniform), textures = [...prepared.images.values()].map(t => t.texture); const release = () => { buffers.forEach(b => b.destroy()); textures.forEach(t => t.destroy()); }; if (immediate) release(); else void this.device.queue.onSubmittedWorkDone().then(release); }
    status() { return { ready: !!this.active, frame: this.frame, time: this.time, fps: this.frameRate.value, width: this.width, height: this.height, playing: this.playing, mode: this.mode, bufferFormat: this.bufferFormat,
        capture: { active: this.cameraInput.active, width: this.cameraTexture?.width ?? 0, height: this.cameraTexture?.height ?? 0, time: this.cameraTime } }; }
    async sound(start: number, count: number) { if (!this.active?.sound)
        throw Error('请启用并编译 Sound'); const p = this.active; p.soundInputs?.splice(0, 4, ...this.inputs(p, p.project.sound, this.current, resolveChannelBindings(p.project.sound, p.project.common).dimensions)); return p.sound!.render(start, count, () => !this.dead && this.active === p); }
    /** A deterministic first frame for practice judging; the host keeps owning presentation. */
    renderStill() { this.setPlaying(false); this.reset(); this.render(0); }
    async readImage(id: PassId = 'image') { const output = this.targets.get(id)?.[this.current]; if (!output)
        throw Error('尚无渲染结果'); if (id !== 'image')
        throw Error('请切换 Image 后导出截图'); const stride = Math.ceil(output.width * 4 / 256) * 256, buffer = this.device.createBuffer({ size: stride * output.height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }); try {
        const encoder = this.device.createCommandEncoder();
        encoder.copyTextureToBuffer({ texture: output.texture }, { buffer, bytesPerRow: stride }, [output.width, output.height]);
        this.device.queue.submit([encoder.finish()]);
        await buffer.mapAsync(GPUMapMode.READ);
        const mapped = new Uint8Array(buffer.getMappedRange()), pixels = new Uint8Array(output.width * output.height * 4);
        for (let y = 0; y < output.height; y++)
            pixels.set(mapped.subarray(y * stride, y * stride + output.width * 4), y * output.width * 4);
        buffer.unmap();
        return { width: output.width, height: output.height, pixels };
    }
    finally {
        buffer.destroy();
    } }
    dispose() {
        if (this.dead) return;
        this.dead = true; ++this.generation; this.orbit?.dispose();
        // Host destroys the device immediately after this hook. Do not enqueue
        // a queue fence whose deferred callback would run on a destroyed device.
        // WebGPU resource destruction preserves already submitted GPU work.
        this.clearTargets(true);
        if (this.active) this.release(this.active, true);
        this.active = undefined; this.pipelineCache.clear();
        this.cameraInput.dispose(); this.cameraTexture?.texture.destroy(); this.cameraTexture = undefined;
        for (const t of [this.black, this.cube, this.keys]) t?.texture.destroy();
        this.presentSize?.destroy(); this.scene?.destroy();
        this.onFrame = undefined; this.onCameraError = undefined;
    }
}
