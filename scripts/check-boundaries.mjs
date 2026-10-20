import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, dirname, sep } from 'node:path';
const root = resolve(import.meta.dirname, '..'), violations = [];
// Existing shader/compiler content is still product code. Native consumes source,
// never Web's generated page artifacts or browser UI/runtime entry points.
const mobileWebSources = new Set(['sound','wgsl','glslProject','sourceProject','hlslTypes','channelBindings','shaders','keyboardTexture','examples','tutorialContent','tutorialLabs','glsl']);
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const file = resolve(dir, name);
    if (statSync(file).isDirectory()) { walk(file); continue; }
    if (!/\.[cm]?[jt]s$/.test(file) || file.endsWith('.d.ts')) continue;
    const source = readFileSync(file, 'utf8'), location = relative(root, file);
    for (const match of source.matchAll(/(?:from\s*|import\s*\()(['"])([^'"]+)\1/g)) {
      const spec = match[2], shared = location.startsWith('shared/');
      if (spec.startsWith('.')) {
        const target = resolve(dirname(file), spec), targetPath = relative(root, target);
        if (!target.startsWith(root + sep)) violations.push(`${location} imports outside ShaderLab: ${spec}`);
        if (shared && !target.startsWith(resolve(root, 'shared') + sep)) violations.push(`${location} imports a platform adapter: ${spec}`);
        if (location.startsWith('mobile/src/')) {
          if (targetPath.startsWith('web/dist/')) violations.push(`${location} depends on Web build artifacts: ${spec}`);
          if (targetPath.startsWith('web/src/') && !mobileWebSources.has(targetPath.slice(8).replace(/\.js$/, ''))) violations.push(`${location} imports unapproved Web code: ${spec}`);
        }
      } else if (shared && !(location.startsWith('shared/views/') && ['@haiyue/ui/core','@haiyue/ui/portable'].includes(spec))) violations.push(`${location} imports a runtime package: ${spec}`);
      else if (/^@haiyue\/(?:engine|ui)\/(?:src|dist)\//.test(spec)) violations.push(`${location} imports private package implementation: ${spec}`);
    }
  }
}
for (const dir of ['web/src','mobile/src','shared/domain','shared/application','shared/ports','shared/views']) walk(resolve(root, dir));
for (const manifest of ['package.json','web/package.json','mobile/package.json']) {
  const pkg = JSON.parse(readFileSync(resolve(root, manifest)));
  for (const value of Object.values({ ...pkg.dependencies, ...pkg.devDependencies })) {
    // Packed artifacts inside this repository are permitted; sibling checkouts are not.
    if (typeof value === 'string' && value.startsWith('file:')) {
      const target = resolve(dirname(resolve(root, manifest)), value.slice(5));
      if (!target.startsWith(root + sep)) violations.push(`${manifest} uses a sibling checkout dependency`);
    }
  }
}
if (violations.length) throw Error(violations.join('\n'));
console.log('ShaderLab boundaries passed: shared has no platform imports; mobile has no Web build-artifact imports.');
