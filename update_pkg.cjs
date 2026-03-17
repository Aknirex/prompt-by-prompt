const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

pkg.contributes.commands = pkg.contributes.commands.filter(c => c.command !== 'pbp.addRule');
pkg.contributes.commands.push({ command: 'pbp.createWorkspaceRule', title: '%command.pbp.createWorkspaceRule%', icon: '$(add)' });
pkg.contributes.commands.push({ command: 'pbp.createGlobalRule', title: '%command.pbp.createGlobalRule%', icon: '$(add)' });
pkg.contributes.commands.push({ command: 'pbp.setActiveGlobalRule', title: '%command.pbp.setActiveGlobalRule%' });

pkg.contributes.menus['view/item/context'] = pkg.contributes.menus['view/item/context'].filter(m => m.command !== 'pbp.deleteRule' && m.command !== 'pbp.addRule');
pkg.contributes.menus['view/item/context'].push({ command: 'pbp.createWorkspaceRule', when: 'view == pbp.rulesView && viewItem == workspaceRuleGroup', group: 'inline' });
pkg.contributes.menus['view/item/context'].push({ command: 'pbp.createGlobalRule', when: 'view == pbp.rulesView && viewItem == globalRuleGroup', group: 'inline' });
pkg.contributes.menus['view/item/context'].push({ command: 'pbp.setActiveGlobalRule', when: 'view == pbp.rulesView && viewItem == globalRuleItem', group: 'inline' });
pkg.contributes.menus['view/item/context'].push({ command: 'pbp.deleteRule', when: 'view == pbp.rulesView && viewItem =~ /RuleItem/', group: '1_modification' });

if (pkg.contributes.menus['view/title']) {
   pkg.contributes.menus['view/title'] = pkg.contributes.menus['view/title'].filter(m => m.command !== 'pbp.addRule');
}

// Check "views" -> "pbp-explorer" directly under contributes, removing inline button from previous layout.
if (pkg.contributes.menus['views']) {
   console.log("Found views menu? false (standard UI doesn't usually nest views under menus natively unless it was for Activity bar... wait there is a views section in package json natively, but usually it's for declaring views, not menus!");
}
// Clean up manually any pbp.addRule from view/title or view contribution.
if (pkg.contributes.views && pkg.contributes.views['pbp-explorer']) {
   pkg.contributes.views['pbp-explorer'] = pkg.contributes.views['pbp-explorer'].filter((v) => !v.command || v.command !== 'pbp.addRule' );
}

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
