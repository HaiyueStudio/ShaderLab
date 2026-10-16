import { HaiyueEngine, Entity, Camera3D, CartesianTransform3D, SphericalTransform3D, OrbitControl, BasicMaterial, Mesh3D, createSphere3D, createBox3D } from '@haiyue/engine';
import { createTorus3D } from '@haiyue/engine/geometry';
import { NativeVideo } from './video';
import { ImageAsset } from '@nativescript/canvas';
import { ImageSource, knownFolders, path } from '@nativescript/core';
import { NativeCanvasTextures } from '@haiyue/native/engine';
import { validateProject, usesCurrentFrame, CUBE_FACES, type ShaderProject, type ShaderPass, type BufferId, type PassId, type ShaderDiagnostic, type PreviewMode, type PreviewMesh } from '../../web/dist/model.js';
import { refreshProjectGlsl } from '../../web/dist/glslProject.js';
import { resolveChannelBindings } from '../../web/dist/channelBindings.js';
import { PRESENT, wrapShader } from '../../web/dist/shaders.js';
import { builtinTexture } from '../../web/dist/builtinTextures.js';
import { KeyboardState } from '../../web/dist/keyboardTexture.js';
import { createSoundRenderer, SoundCompileError, type SoundRenderer } from '../../web/dist/sound.js';
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
type Prepared = {
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
export class NativeShaderRuntime {
    private active?: Prepared;
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
    constructor(readonly engine: HaiyueEngine, readonly requestFrame: () => void, private readonly orbitTarget: HTMLCanvasElement) { this.bufferFormat = engine.device.features.has('float32-filterable') ? 'rgba32float' : 'rgba16float'; }
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
    async compile(project: ShaderProject) {
        const generation = ++this.generation, snapshot = validateProject(structuredClone(project));
        const next: Prepared = { project: snapshot, passes: [], images: new Map(), videos: new Map(), diagnostics: refreshProjectGlsl(snapshot) };
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
            if (this.dead || generation !== this.generation) {
                this.release(next);
                return { stale: true, diagnostics: next.diagnostics };
            }
            const old = this.active;
            this.active = next;
            this.reset();
            this.setMode(snapshot.preview.mode, snapshot.preview.mesh);
            if (old)
                this.release(old);
            return { stale: false, diagnostics: next.diagnostics };
        }
        catch (error) {
            this.release(next);
            if (error instanceof SoundCompileError)
                throw new NativeCompileError(error.diagnostics);
            throw error;
        }
    }
    private inputs(prepared: Prepared, pass: {
        id: PassId | 'sound';
        channels: ShaderPass['channels'];
    }, next: number, dimensions: ('2d' | 'cube')[]) { return pass.channels.map((c, i) => c.kind === 'keyboard' ? this.keys : c.kind === 'buffer' ? this.targets.get(c.pass)?.[usesCurrentFrame(pass.id as PassId, c.pass) ? next : this.current] ?? this.black : c.kind === 'builtin' ? prepared.images.get('builtin:' + c.texture) ?? this.black : c.kind === 'image' || c.kind === 'cubemap' || c.kind === 'video' ? prepared.images.get(c.assetId) ?? this.black : dimensions[i] === 'cube' ? this.cube : this.black); }
    private videoFrame(prepared: Prepared, id: string, video: NativeVideo, time: number) {
        const image = video.at(time);
        if (!image)
            return;
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
            let target = prepared.images.get(id);
            if (!target || target.width !== width || target.height !== height) {
                const old = target;
                target = this.texture(width, height, 'rgba8unorm');
                prepared.images.set(id, target);
                if (old)
                    void this.device.queue.onSubmittedWorkDone().then(() => old.texture.destroy());
            }
            this.device.queue.writeTexture({ texture: target.texture }, pixels, { bytesPerRow: width * 4 }, [width, height]);
        }
        finally {
            raster.dispose();
        }
    }
    private resize() { if (!this.active)
        return; const scale = this.active.project.preview.scale; const factor = Math.min(scale, 1280 / Math.max(this.engine.width, this.engine.height), Math.sqrt(786432 / (this.engine.width * this.engine.height))); const width = Math.max(1, Math.floor(this.engine.width * factor)), height = Math.max(1, Math.floor(this.engine.height * factor)); if (width === this.width && height === this.height && this.targets.size)
        return; this.clearTargets(); this.width = width; this.height = height; for (const p of this.active.passes)
        this.targets.set(p.pass.id, [this.texture(width, height, p.pass.id === 'image' ? 'rgba8unorm' : this.bufferFormat), this.texture(width, height, p.pass.id === 'image' ? 'rgba8unorm' : this.bufferFormat)]); this.frame = 0; this.time = 0; this.dirty = true; }
    private render(delta: number) {
        if (!this.active || this.dead)
            return;
        this.resize();
        const advance = this.playing || this.stepPending;
        this.stepPending = false;
        if (advance || this.dirty) {
            const dt = advance ? Math.min(.1, Math.max(0, delta)) : 0;
            if (this.frame > 0)
                this.time += dt;
            for (const [id, video] of this.active.videos)
                this.videoFrame(this.active, id, video, this.time);
            const encoder = this.device.createCommandEncoder();
            this.device.queue.writeTexture({ texture: this.keys.texture }, this.keyboard.pixels(), { bytesPerRow: 1024 }, [256, 3]);
            const next = 1 - this.current;
            for (const compiled of this.active.passes) {
                const inputs = this.inputs(this.active, compiled.pass, next, compiled.dimensions), data = new Float32Array(36);
                data.set([this.width, this.height, 1, this.time, dt, this.frame, dt > 0 ? 1 / dt : 0, 44100]);
                data.set(this.mouse, 8);
                const date = new Date();
                data.set([date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds() + date.getMilliseconds() / 1000], 12);
                inputs.forEach((input, i) => { if (compiled.pass.channels[i]!.kind !== 'none')
                    data.set([input.width, input.height, 1, 0], 16 + i * 4); if (compiled.pass.channels[i]!.kind === 'video')
                    data[32 + i] = this.time % (this.active!.videos.get((compiled.pass.channels[i] as {
                        assetId: string;
                    }).assetId)?.duration ?? 1); if (compiled.pass.channels[i]!.kind === 'buffer')
                    data[32 + i] = usesCurrentFrame(compiled.pass.id, (compiled.pass.channels[i] as {
                        pass: BufferId;
                    }).pass) ? this.time : Math.max(0, this.time - dt); });
                this.device.queue.writeBuffer(compiled.uniform, 0, data);
                const group = this.device.createBindGroup({ layout: compiled.layout, entries: [{ binding: 0, resource: this.sampler }, ...inputs.map((t, i) => ({ binding: i + 1, resource: t.view }))] });
                const pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.targets.get(compiled.pass.id)![next]!.view, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] });
                pass.setPipeline(compiled.pipeline);
                pass.setBindGroup(0, compiled.group, new Uint32Array(0), 0, 0);
                pass.setBindGroup(1, this.emptyGroup, new Uint32Array(0), 0, 0);
                pass.setBindGroup(2, group, new Uint32Array(0), 0, 0);
                pass.draw(3);
                pass.end();
            }
            this.device.queue.submit([encoder.finish()]);
            this.current = next;
            this.frame++;
            this.dirty = this.keyboard.endFrame();
        }
        const output = this.targets.get(this.viewed)?.[this.current] ?? this.targets.get('image')?.[this.current];
        if (!output)
            return;
        if (this.mode === 'scene')
            this.material.texture = output.texture;
        else {
            this.device.queue.writeBuffer(this.presentSize, 0, new Float32Array([this.engine.width, this.engine.height, 0, 0]));
            const group = this.device.createBindGroup({ layout: this.presenter.getBindGroupLayout(0), entries: [{ binding: 0, resource: output.view }, { binding: 1, resource: this.sampler }, { binding: 2, resource: { buffer: this.presentSize } }] });
            const encoder = this.device.createCommandEncoder(), pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.engine.getOutputView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
            pass.setPipeline(this.presenter);
            pass.setBindGroup(0, group, new Uint32Array(0), 0, 0);
            pass.draw(3);
            pass.end();
            this.device.queue.submit([encoder.finish()]);
        }
        this.onFrame?.();
    }
    setMode(mode: PreviewMode, mesh: PreviewMesh = 'sphere') { this.mode = mode; this.orbit?.dispose(); this.orbit = undefined; this.mesh.geometry = this.geometry[mesh]; this.engine.switchScene(mode === 'scene' ? this.scene : null); if (mode === 'scene')
        this.orbit = new OrbitControl(this.orbitTarget, this.camera, { minRadius: 1.8, maxRadius: 12, enablePan: false }); this.requestFrame(); }
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
    setPlaying(value: boolean) { this.playing = value; this.requestFrame(); }
    step() { this.playing = false; this.stepPending = true; this.requestFrame(); }
    reset() { this.frame = 0; this.time = 0; this.keyboard.reset(); this.dirty = true; this.clearTargets(); this.requestFrame(); }
    private clearTargets() { const old = [...this.targets.values()].flat().map(t => t.texture); this.targets.clear(); void this.device.queue.onSubmittedWorkDone().then(() => old.forEach(t => t.destroy())); }
    private release(prepared: Prepared) { prepared.sound?.dispose(); for (const video of prepared.videos.values())
        video.dispose(); const buffers = prepared.passes.map(p => p.uniform), textures = [...prepared.images.values()].map(t => t.texture); void this.device.queue.onSubmittedWorkDone().then(() => { buffers.forEach(b => b.destroy()); textures.forEach(t => t.destroy()); }); }
    status() { return { ready: !!this.active, frame: this.frame, time: this.time, width: this.width, height: this.height, playing: this.playing, mode: this.mode, bufferFormat: this.bufferFormat }; }
    async sound(start: number, count: number) { if (!this.active?.sound)
        throw Error('请启用并编译 Sound'); const p = this.active; p.soundInputs?.splice(0, 4, ...this.inputs(p, p.project.sound, this.current, resolveChannelBindings(p.project.sound, p.project.common).dimensions)); return p.sound!.render(start, count, () => !this.dead && this.active === p); }
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
    dispose() { this.dead = true; ++this.generation; this.orbit?.dispose(); this.clearTargets(); if (this.active)
        this.release(this.active); for (const t of [this.black, this.cube, this.keys])
        t?.texture.destroy(); this.presentSize?.destroy(); }
}
