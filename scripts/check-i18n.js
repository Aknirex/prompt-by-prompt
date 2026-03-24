const fs = require('fs');
const path = require('path');

const runtimeFile = path.join(__dirname, '..', 'src', 'utils', 'i18n.ts');
const packageFiles = [
  'package.nls.json',
  'package.nls.zh-cn.json',
  'package.nls.ja.json',
  'package.nls.es.json',
  'package.nls.ko.json',
].map((file) => path.join(__dirname, '..', file));

function parseRuntimeDictionaries(source) {
  const dictRegex = /const (\w+)_dict: Record<string, string> = \{([\s\S]*?)\n\};/g;
  const dictionaries = {};
  let match;

  while ((match = dictRegex.exec(source))) {
    const [, name, body] = match;
    dictionaries[name] = new Set(
      [...body.matchAll(/'((?:\\'|[^'])+)': '/g)].map((entry) => entry[1])
    );
  }

  return dictionaries;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function assertNoMissing(label, baseKeys, compareKeys) {
  const missing = baseKeys.filter((key) => !compareKeys.has(key));
  if (missing.length === 0) {
    console.log(`${label}: OK`);
    return true;
  }

  console.error(`${label}: missing ${missing.length} keys`);
  for (const key of missing) {
    console.error(`  - ${key}`);
  }
  return false;
}

const runtimeSource = fs.readFileSync(runtimeFile, 'utf8');
const runtimeDicts = parseRuntimeDictionaries(runtimeSource);
const runtimeBase = [...(runtimeDicts.en || new Set())];

let ok = true;
for (const [name, keys] of Object.entries(runtimeDicts)) {
  if (name === 'en') {
    continue;
  }
  ok = assertNoMissing(`runtime:${name}`, runtimeBase, keys) && ok;
}

const packageBase = Object.keys(readJson(packageFiles[0]));
for (const file of packageFiles.slice(1)) {
  const keys = new Set(Object.keys(readJson(file)));
  ok = assertNoMissing(`package:${path.basename(file)}`, packageBase, keys) && ok;
}

if (!ok) {
  process.exitCode = 1;
}
