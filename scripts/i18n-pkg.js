const fs = require('fs');

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const en = {};
const zh = {};

// We will extract titles, descriptions, etc.
// 1. Commands
pkg.contributes.commands.forEach(cmd => {
    const key = `command.${cmd.command}`;
    en[key] = cmd.title;
    // We will do a generic replacement for zh in another step or just manually define it
    cmd.title = `%${key}%`;
});

// 2. Views
Object.keys(pkg.contributes.viewsContainers).forEach(k => {
    pkg.contributes.viewsContainers[k].forEach(v => {
        const key = `viewContainer.${v.id}`;
        en[key] = v.title;
        v.title = `%${key}%`;
    });
});

Object.keys(pkg.contributes.views).forEach(k => {
    pkg.contributes.views[k].forEach(v => {
        const key = `view.${v.id}`;
        en[key] = v.name;
        v.name = `%${key}%`; // wait, is it name or title? It's 'name'
    });
});

// 3. Configuration
const cfg = pkg.contributes.configuration;
const titleKey = `config.title`;
if (cfg.title && !cfg.title.startsWith('%')) {
    en[titleKey] = cfg.title;
    cfg.title = `%${titleKey}%`;
}

Object.keys(cfg.properties).forEach(k => {
    const prop = cfg.properties[k];
    if (prop.description && !prop.description.startsWith('%')) {
        const descKey = `config.${k}.description`;
        en[descKey] = prop.description;
        prop.description = `%${descKey}%`;
    }
});

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
fs.writeFileSync('package.nls.json', JSON.stringify(en, null, 2));
