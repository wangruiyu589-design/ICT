const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else files.push(full);
  }
}
function assert(condition, message) { if (!condition) throw new Error(message); }
walk(root);
let scripts = 0, jsons = 0;
for (const file of files) {
  if (/\.(?:js|cjs)$/.test(file)) {
    const checked = spawnSync(process.execPath, ['--check', file], {encoding: 'utf8'});
    assert(checked.status === 0, `${file}: ${checked.stderr}`);
    scripts += 1;
  }
  if (file.endsWith('.json')) { JSON.parse(fs.readFileSync(file, 'utf8')); jsons += 1; }
}
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
assert(app.pages.length === 5 && app.tabBar.list.length === 5, 'Expected five pages and five tabs');
for (const page of app.pages) for (const extension of ['js', 'json', 'wxml', 'wxss']) assert(fs.existsSync(path.join(root, page + '.' + extension)), `Missing ${page}.${extension}`);
for (const tab of app.tabBar.list) {
  assert(app.pages.includes(tab.pagePath), `Unknown tab route: ${tab.pagePath}`);
  for (const field of ['iconPath', 'selectedIconPath']) {
    const icon = fs.readFileSync(path.join(root, tab[field]));
    assert(icon.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), `Invalid PNG: ${tab[field]}`);
  }
}
for (const file of files.filter(item => item.endsWith('.wxml'))) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/<import\s+src="([^"]+)"/g)) assert(fs.existsSync(path.resolve(path.dirname(file), match[1])), `Missing import in ${file}`);
  for (const match of source.matchAll(/wx:(?:if|elif)="([^"]*)"/g)) assert(match[1].startsWith('{{') && match[1].endsWith('}}'), `Conditional is not a binding in ${file}: ${match[1]}`);
}
process.stdout.write(`OK: ${scripts} JavaScript files, ${jsons} JSON files, 5 complete pages, 10 PNG icons, template imports and conditional bindings.\n`);
