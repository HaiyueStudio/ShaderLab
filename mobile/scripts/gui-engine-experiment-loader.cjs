// Opt-in experiment only. Keep Engine 0.2.0 and replace six private GUI classes,
// retaining the original classes for a same-IPA control. Never publish this patch.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), ts = require('typescript');
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
module.exports = function(source) {
  this.cacheable(false);
  const originalHash = hash(source);
  if (originalHash !== '73e59fd3be0b6dc953af547e7429048416b158ffbb3d1a32eba8ee8a68b140bf') throw Error('GUI experiment requires the frozen Engine 0.2.0 GUI chunk');
  const root = path.resolve(__dirname, '../../../Engine/engine/src/gui/rendering');
  const classes = ['GuiBatch', 'GuiTextBatch', 'GuiImageBatch', 'GuiShapeRenderer', 'GuiTextRenderer', 'GuiImageRenderer'];
  const manifest = { baseVersion: '0.2.0', originalHash, sources: {} };
  for (const name of classes) {
    const file = path.join(root, name + '.ts'); this.addDependency(file);
    const input = fs.readFileSync(file, 'utf8'); manifest.sources[name] = hash(input);
    const output = ts.transpileModule(input, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const ast = ts.createSourceFile(name + '.js', output, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
    let replacement = ast.statements.find(n => ts.isClassDeclaration(n) && n.name.text === name).getText(ast).replace(/^export /, '');
    if (name === 'GuiBatch') replacement = replacement.replace(/\bnextCapacity\b/g, 'nextCapacity$1').replace(/\bwriteVertex\b/g, 'writeVertex$1');
    const oldAst = ts.createSourceFile('gui.js', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
    const old = oldAst.statements.find(n => ts.isClassDeclaration(n) && n.name.text === name);
    if (!old) throw Error('Missing private GUI class: ' + name);
    const legacy = old.getText(oldAst).replace('class ' + name, 'class Baseline' + name);
    // The toggle is selected before constructing the experiment scene. Neither
    // path adds a hot-loop branch or changes the imported GUI element classes.
    const ctor = `constructor() { ${replacement.includes('extends BaseRenderer') ? 'super();' : ''} if (globalThis.__shaderlabGuiBaseline) return new Baseline${name}(...arguments); }`;
    if (name === 'GuiTextRenderer') {
      // Preserve the injected native RGBA atlas reader.
      replacement = replacement.replace('constructor(readAtlasPixels) {', 'constructor(readAtlasPixels) {');
      const at = replacement.indexOf('super();', replacement.indexOf('constructor('));
      replacement = replacement.slice(0, at) + replacement.slice(at).replace('super();', `super(); if (globalThis.__shaderlabGuiBaseline) return new Baseline${name}(...arguments);`);
    } else replacement = replacement.replace(/(class \w+(?: extends \w+)? \{)/, '$1\n' + ctor);
    source = source.slice(0, old.getStart(oldAst)) + legacy + '\n' + replacement + source.slice(old.end);
  }
  const helpers = path.join(root, 'GuiCommandCache.ts'); this.addDependency(helpers);
  const input = fs.readFileSync(helpers, 'utf8'); manifest.sources.GuiCommandCache = hash(input);
  source += '\n' + ts.transpileModule(input, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/export /g, '');
  source += '\nglobalThis.__shaderlabGuiPatch = true;\n';
  manifest.outputHash = hash(source);
  const out = path.resolve(__dirname, '../artifacts/gui-engine-experiment'); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
  for (const name of [...classes, 'GuiCommandCache']) fs.copyFileSync(path.join(root, name + '.ts'), path.join(out, name + '.ts'));
  return source;
};
