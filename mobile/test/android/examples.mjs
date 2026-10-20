import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

// Uses the PNG decoder already installed by the pinned NativeScript CLI.
const { PNG } = createRequire(import.meta.url)('pngjs');
const run = promisify(execFile);
const adb = process.env.ADB || 'adb';
const serial = process.env.ANDROID_SERIAL || process.argv[2];
assert.ok(serial, 'Set ANDROID_SERIAL or pass the adb device serial.');
const out = resolve(process.env.SHADERLAB_ANDROID_EVIDENCE || 'mobile/artifacts/android-examples');
mkdirSync(out, { recursive: true });
const app = 'studio.haiyue.shaderlab';
const samples = [
  ['aurora', 'Aurora ribbons', true], ['marble', 'Liquid chrome', true],
  ['tunnel', 'Neon passage', true], ['feedback', 'Afterglow', true],
  ['keyboard', 'Key light', false], ['puzzle', 'Sliding city', false],
  ['minesweeper', 'Minefield', false], ['clock', 'Local time · 时钟', true],
];
const report = { status: 'running', package: app, device: {}, examples: [] };
let pid = '', dumpNumber = 0, current = 'startup';
const saveReport = () => writeFileSync(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function command(...args) {
  return (await run(adb, ['-s', serial, ...args], { timeout: 45000, maxBuffer: 32 * 1024 * 1024, encoding: 'buffer' })).stdout;
}
const shell = async (...args) => (await command('shell', ...args)).toString().trim();
const text = node => node.attrs.text || node.attrs['content-desc'] || '';
const decode = value => value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function nodesOf(xml) {
  const nodes = [], stack = [];
  for (const match of xml.matchAll(/<(\/?)node\b([^>]*)>/g)) {
    if (match[1]) { stack.pop(); continue; }
    const attrs = Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], decode(m[2])]));
    const bounds = (attrs.bounds?.match(/\d+/g) || []).map(Number);
    const node = { attrs, bounds, parent: stack.at(-1), children: [] };
    node.parent?.children.push(node);
    nodes.push(node);
    if (!match[2].trimEnd().endsWith('/')) stack.push(node);
  }
  return nodes;
}
async function dump() {
  await shell('uiautomator', 'dump', '/sdcard/shaderlab-examples.xml');
  const xml = (await command('exec-out', 'cat', '/sdcard/shaderlab-examples.xml')).toString();
  assert.ok(xml.includes('<hierarchy'), 'Missing Android UI hierarchy');
  writeFileSync(resolve(out, `${String(++dumpNumber).padStart(3, '0')}-${current}.xml`), xml);
  return nodesOf(xml);
}
const visible = node => node.bounds.length === 4 && node.bounds[2] > node.bounds[0] && node.bounds[3] > node.bounds[1];
const button = (nodes, label) => nodes.find(n => text(n) === label && /Button$/.test(n.attrs.class) && visible(n));
async function tap(node, fractionY = .5) {
  assert.ok(node && visible(node), 'Cannot tap a missing or empty control');
  const [x0, y0, x1, y1] = node.bounds;
  await shell('input', 'tap', String(Math.round((x0 + x1) / 2)), String(Math.round(y0 + (y1 - y0) * fractionY)));
}
async function waitUI(predicate, label, timeout = 45000) {
  const end = Date.now() + timeout;
  do {
    const nodes = await dump();
    assert.ok(!nodes.some(n => /^编译失败|^Runtime Error|^应用无响应/.test(text(n))), `Application error while waiting for ${label}`);
    if (predicate(nodes)) return nodes;
    await delay(350);
  } while (Date.now() < end);
  throw Error(`Timed out waiting for ${label}`);
}
const exampleCards = nodes => nodes.filter(n => n.attrs['resource-id']?.startsWith('example-') && /Button$/.test(n.attrs.class) && visible(n));
async function openExample(id, name) {
  for (let attempt = 0; attempt < 18; attempt++) {
    const nodes = await dump();
    assert.ok(!button(nodes, '打开 ↗'), 'Examples must not have a separate Open button');
    const card = exampleCards(nodes).find(n => n.attrs['resource-id'] === 'example-' + id);
    if (card && card.bounds[3] - card.bounds[1] > 180) {
      // Exercise the upper, middle and lower parts of the full-card target.
      const fraction = [.25, .65, .9][samples.findIndex(sample => sample[0] === id) % 3];
      await tap(card, fraction);
      return;
    }
    const width = Math.max(...nodes.filter(visible).map(n => n.bounds[2]));
    const height = Math.max(...nodes.filter(visible).map(n => n.bounds[3]));
    await shell('input', 'swipe', String(Math.round(width / 2)), String(Math.round(height * .76)), String(Math.round(width / 2)), String(Math.round(height * .48)), '350');
  }
  throw Error(`Example card is not reachable: ${name}`);
}
async function screenshot(name) {
  const bytes = await command('exec-out', 'screencap', '-p');
  writeFileSync(resolve(out, name + '.png'), bytes);
  return PNG.sync.read(bytes);
}
function previewBounds(nodes, image) {
  const run = button(nodes, '运行'), options = button(nodes, 'Canvas / 3D');
  assert.ok(run && options, 'Preview controls must be visible');
  const controls = nodes.filter(n => /Button$/.test(n.attrs.class) && ['运行', '暂停', '重置', '单帧'].includes(text(n)) && Math.abs(n.bounds[1] - run.bounds[1]) < 20);
  const top = Math.max(...controls.map(n => n.bounds[3])) + 4;
  const bottom = options.bounds[1] - 4;
  assert.ok(bottom - top > 100, 'Preview must have a usable height');
  return { left: 4, top, right: image.width - 4, bottom };
}
function pixelsOf(image, bounds) {
  const pixels = [];
  for (let y = bounds.top; y < bounds.bottom; y += 4)
    for (let x = bounds.left; x < bounds.right; x += 4) {
      const i = (y * image.width + x) * 4;
      pixels.push(image.data[i], image.data[i + 1], image.data[i + 2]);
    }
  return Buffer.from(pixels);
}
function statsOf(pixels) {
  const colors = new Set();
  let total = 0, squares = 0;
  for (let i = 0; i < pixels.length; i += 3) {
    colors.add((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2]);
    const value = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    total += value; squares += value * value;
  }
  const count = pixels.length / 3, mean = total / count;
  return { sampledPixels: count, uniqueColors: colors.size, brightnessDeviation: Math.sqrt(squares / count - mean * mean), sha256: createHash('sha256').update(pixels).digest('hex') };
}
try {
  for (const [key, property] of Object.entries({ manufacturer: 'ro.product.manufacturer', model: 'ro.product.model', android: 'ro.build.version.release', api: 'ro.build.version.sdk', abi: 'ro.product.cpu.abi' }))
    report.device[key] = await shell('getprop', property);
  report.device.vulkanFeatures = (await shell('pm', 'list', 'features')).split('\n').filter(s => s.includes('vulkan'));
  assert.ok(report.device.vulkanFeatures.some(s => s.includes('vulkan.version')), 'Device must support Vulkan');
  await shell('am', 'force-stop', app);
  await shell('am', 'start', '-W', '-n', `${app}/com.tns.NativeScriptActivity`);
  await waitUI(nodes => button(nodes, '＋ 新建'), 'Gallery');
  pid = await shell('pidof', app);
  await screenshot('gallery');
  for (const [id, name, animated] of samples) {
    current = id;
    await openExample(id, name);
    await waitUI(nodes => button(nodes, '保存') && nodes.some(n => text(n) === name), name + ' editor');
    let nodes = await waitUI(nodes => nodes.some(n => /^原生 WebGPU 已呈现 \d+ 帧/.test(text(n))), name + ' first GPU frame');
    await tap(button(nodes, '运行'));
    nodes = await waitUI(nodes => nodes.some(n => /^编译成功 · /.test(text(n))), name + ' successful compile');
    const status = nodes.find(n => /^编译成功 · /.test(text(n)));
    const image = await screenshot(id), bounds = previewBounds(nodes, image);
    const pixels = pixelsOf(image, bounds), stats = statsOf(pixels);
    assert.ok(stats.uniqueColors > 24 && stats.brightnessDeviation > 2, `${name}: preview is blank or flat`);
    const result = { id, name, status: 'passed', compile: text(status), firstFrame: true, bounds, pixels: stats, screenshot: id + '.png' };
    if (animated) {
      await delay(1400);
      const later = pixelsOf(await screenshot(id + '-later'), bounds);
      let changed = 0;
      for (let i = 0; i < pixels.length; i += 3)
        if (Math.abs(pixels[i] - later[i]) + Math.abs(pixels[i + 1] - later[i + 1]) + Math.abs(pixels[i + 2] - later[i + 2]) > 12) changed++;
      assert.ok(changed > 10, `${name}: animation did not advance`);
      result.animation = { changedPixels: changed, laterScreenshot: id + '-later.png' };
    }
    await shell('input', 'keyevent', 'KEYCODE_BACK');
    await waitUI(nodes => nodes.some(n => text(n) === 'haiyue / ShaderLab') && exampleCards(nodes).length > 0, 'return to Gallery');
    assert.equal(await shell('pidof', app), pid, 'App must remain alive without restarting');
    report.examples.push(result);
    saveReport();
    console.log(`${name}: opened, compiled, rendered${animated ? ' and animated' : ''}, returned to Gallery`);
  }
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = { example: current, message: String(error.stack || error) };
  await screenshot(current + '-failure').catch(() => {});
  throw error;
} finally {
  if (pid) writeFileSync(resolve(out, 'logcat.txt'), await command('logcat', '-d', '--pid=' + pid, '-v', 'threadtime').catch(() => Buffer.from('Unable to collect app logcat')));
  saveReport();
}
console.log(`All ${report.examples.length} examples passed on ${report.device.manufacturer} ${report.device.model} (Android ${report.device.android}).`);
