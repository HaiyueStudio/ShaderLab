// Opt-in full-package benchmark. Never silently combine current GUI with an old engine.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
function engineCandidate(directory) {
  const root = path.resolve(directory), pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  if (pkg.name !== '@haiyue/engine') throw Error('Expected an @haiyue/engine package');
  const hash = crypto.createHash('sha256');
  const visit = dir => fs.readdirSync(dir, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).forEach(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (entry.name.endsWith('.js')) hash.update(path.relative(root, file)).update('\0').update(fs.readFileSync(file));
  });
  hash.update(fs.readFileSync(path.join(root, 'package.json'))); visit(path.join(root, 'dist'));
  const aliases = {};
  for (const [key, value] of Object.entries(pkg.exports)) {
    const target = typeof value === 'string' ? value : value.import;
    if (!target) continue;
    const file = path.resolve(root, target);
    if (!fs.existsSync(file)) throw Error('Missing built Engine export: ' + file);
    aliases['@haiyue/engine' + (key === '.' ? '' : key.slice(1)) + '$'] = file;
  }
  return {aliases, identity:{version:pkg.version, sha256:hash.digest('hex'), kind:'full-package'}};
}
module.exports = {engineCandidate};
