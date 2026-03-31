import { RuleEditorDraft } from './ruleEditorState';

export interface RuleEditorHtmlOptions {
  draft: RuleEditorDraft;
  initialYamlDraft: string;
  isEditing: boolean;
  fileNameOptions: string[];
}

export function buildRuleEditorHtml(options: RuleEditorHtmlOptions): string {
  const { draft, initialYamlDraft, isEditing, fileNameOptions } = options;
  const title = isEditing ? `Edit Rule: ${escapeHtml(draft.fileName)}` : 'Create New Rule';
  const fileOptions = fileNameOptions
    .map((value) => `<option value="${escapeHtml(value)}"${value === draft.fileName ? ' selected' : ''}>${escapeHtml(value)}</option>`)
    .join('');
  const kindOptions = ['instruction', 'preference', 'guardrail']
    .map((value) => `<option value="${value}"${draft.kind === value ? ' selected' : ''}>${value}</option>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body{margin:0;padding:20px;font-family:var(--vscode-font-family);color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)}
    .container{max-width:1180px;margin:0 auto;display:grid;gap:16px}
    .section{border:1px solid var(--vscode-panel-border);background:color-mix(in srgb,var(--vscode-sideBar-background) 72%,transparent);padding:16px}
    .header,.toolbar,.actions{display:flex;justify-content:space-between;align-items:center;gap:12px}
    .layout{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(360px,0.85fr);gap:16px}
    .grid-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .form-group{margin-bottom:12px}
    label{display:block;margin-bottom:6px;font-weight:600}
    input[type="text"],input[type="number"],select,textarea{width:100%;padding:9px 12px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);font:inherit}
    textarea{resize:vertical;min-height:140px;font-family:var(--vscode-editor-font-family)}
    textarea.body{min-height:360px}
    textarea.yaml{min-height:420px}
    .hint,.subtle{color:var(--vscode-descriptionForeground);font-size:.9em;line-height:1.45}
    .editor-mode-buttons{display:inline-flex;border:1px solid var(--vscode-panel-border)}
    .editor-mode-btn{background:transparent;color:var(--vscode-editor-foreground);border:none;padding:8px 14px}
    .editor-mode-btn.active{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
    .editor-mode-panel{display:none}
    .editor-mode-panel.active{display:block}
    .yaml-toolbar{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px}
    .message{display:none;padding:10px 12px;border:1px solid transparent;margin-top:10px}
    .message.active{display:block}
    .message.info{background:color-mix(in srgb,var(--vscode-textLink-foreground) 12%,transparent);border-color:var(--vscode-panel-border)}
    .message.error{background:var(--vscode-inputValidation-errorBackground);color:var(--vscode-inputValidation-errorForeground);border-color:var(--vscode-inputValidation-errorForeground)}
    button{padding:8px 16px;border:none;cursor:pointer;font:inherit}
    button:disabled{opacity:.6;cursor:not-allowed}
    .primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
    .secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
    .actions{border-top:1px solid var(--vscode-panel-border);padding-top:16px}
    .actions-right{display:flex;gap:12px}
    .pill{padding:4px 8px;border:1px solid var(--vscode-panel-border);background:color-mix(in srgb,var(--vscode-badge-background) 24%,transparent);color:var(--vscode-badge-foreground)}
    @media (max-width: 980px){.layout,.grid-two{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <div class="container">
    <div class="header" style="border-bottom:1px solid var(--vscode-panel-border);padding-bottom:12px;">
      <div>
        <h1>${isEditing ? 'Edit Rule' : 'Create New Rule'}</h1>
        <div class="hint">Create a rule file with frontmatter and body content in one place.</div>
      </div>
      <div class="pill">Global</div>
    </div>

    <div class="section">
      <div class="grid-two">
        <div>
          <h2>Rule Metadata</h2>
          <div class="form-group"><label for="fileName">File Name *</label><select id="fileName">${fileOptions}</select></div>
          <div class="form-group"><label for="title">Title</label><input type="text" id="title" value="${escapeHtml(draft.title)}" placeholder="Short human-readable title"></div>
          <div class="form-group"><label for="kind">Kind</label><select id="kind">${kindOptions}</select></div>
          <div class="grid-two">
            <div class="form-group"><label for="priority">Priority</label><input type="number" id="priority" value="${Number.isFinite(draft.priority) ? draft.priority : 100}"></div>
            <div class="form-group"><label style="margin-bottom:0"><input type="checkbox" id="required"${draft.required ? ' checked' : ''}> Required</label></div>
          </div>
        </div>
        <div>
          <h2>Rule Body</h2>
          <div class="hint">Write the rule text users or agents will read. Keep it short and direct when possible.</div>
          <div class="form-group"><label for="body">Body *</label><textarea id="body" class="body">${escapeHtml(draft.body)}</textarea></div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="toolbar">
        <div>
          <h2>YAML View</h2>
          <div class="subtle">Switch here if you want to edit the generated frontmatter directly.</div>
        </div>
        <div class="editor-mode-buttons">
          <button type="button" class="editor-mode-btn active" data-action="mode" data-mode="form">Form View</button>
          <button type="button" class="editor-mode-btn" data-action="mode" data-mode="yaml">YAML View</button>
        </div>
      </div>
      <div class="editor-mode-panel active" id="editor-panel-form">
        <div class="yaml-toolbar">
          <button type="button" class="secondary" data-action="sync-yaml">Sync Form to YAML</button>
        </div>
        <div class="message info" id="formMessage">Form values drive the generated YAML until you apply YAML back to the form.</div>
      </div>
      <div class="editor-mode-panel" id="editor-panel-yaml">
        <div class="yaml-toolbar">
          <button type="button" class="secondary" data-action="sync-yaml">Sync Form to YAML</button>
          <button type="button" class="secondary" data-action="apply-yaml">Apply YAML to Form</button>
        </div>
        <div class="form-group"><label for="yamlEditor">Rule Definition</label><textarea id="yamlEditor" class="yaml">${escapeHtml(initialYamlDraft)}</textarea></div>
        <div class="message info" id="yamlStatus"></div>
        <div class="message error" id="yamlError"></div>
      </div>
    </div>

    <div class="actions">
      <div class="hint">Use the same editor to create and update global rules.</div>
      <div class="actions-right">
        <button type="button" class="secondary" data-action="cancel">Cancel</button>
        <button type="button" class="primary" data-action="save">Save Rule</button>
      </div>
    </div>
  </div>

  <script>
    (() => {
      const vscode = acquireVsCodeApi();
      const state = { mode: 'form' };
      const el = (id) => document.getElementById(id);
      const q = (root, selector) => root.querySelector(selector);

      const readForm = () => ({
        fileName: el('fileName') instanceof HTMLSelectElement ? el('fileName').value.trim() : '',
        title: el('title') instanceof HTMLInputElement ? el('title').value.trim() : '',
        kind: el('kind') instanceof HTMLSelectElement ? el('kind').value : 'instruction',
        priority: el('priority') instanceof HTMLInputElement && el('priority').value !== '' ? Number(el('priority').value) : 100,
        required: el('required') instanceof HTMLInputElement ? el('required').checked : false,
        body: el('body') instanceof HTMLTextAreaElement ? el('body').value : '',
      });

      const showMessage = (id, text) => {
        const node = el(id);
        if (!(node instanceof HTMLElement)) return;
        node.textContent = text;
        node.classList.add('active');
      };

      const hideMessage = (id) => {
        const node = el(id);
        if (node instanceof HTMLElement) node.classList.remove('active');
      };

      const setMode = (mode) => {
        state.mode = mode;
        q(document, '.editor-mode-btn.active')?.classList.remove('active');
        document.querySelectorAll('.editor-mode-btn').forEach((button) => {
          if (button instanceof HTMLButtonElement && button.dataset.mode === mode) {
            button.classList.add('active');
          }
        });
        el('editor-panel-form')?.classList.toggle('active', mode === 'form');
        el('editor-panel-yaml')?.classList.toggle('active', mode === 'yaml');
        if (mode === 'yaml') {
          vscode.postMessage({ command: 'syncYaml', data: readForm() });
        }
      };

      const save = (useYaml) => {
        const fileName = readForm().fileName;
        if (!fileName) {
          showMessage('yamlError', 'File name is required.');
          return;
        }
        if (useYaml) {
          const yamlText = el('yamlEditor') instanceof HTMLTextAreaElement ? el('yamlEditor').value : '';
          vscode.postMessage({ command: 'saveFromYaml', data: { fileName, yamlText } });
          return;
        }
        vscode.postMessage({ command: 'save', data: readForm() });
      };

      document.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const action = target.dataset.action;
        if (!action) return;
        if (action === 'cancel') {
          vscode.postMessage({ command: 'cancel' });
        } else if (action === 'save') {
          save(state.mode === 'yaml');
        } else if (action === 'sync-yaml') {
          hideMessage('yamlError');
          vscode.postMessage({ command: 'syncYaml', data: readForm() });
        } else if (action === 'apply-yaml') {
          hideMessage('yamlError');
          const yamlText = el('yamlEditor') instanceof HTMLTextAreaElement ? el('yamlEditor').value : '';
          vscode.postMessage({ command: 'applyYaml', data: { yamlText } });
        } else if (action === 'mode') {
          setMode(target.dataset.mode || 'form');
        }
      });

      document.addEventListener('input', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (state.mode === 'form' && ['title', 'kind', 'priority', 'required', 'body', 'fileName'].includes(target.id)) {
          hideMessage('yamlError');
          hideMessage('yamlStatus');
        }
      });

      window.addEventListener('message', (event) => {
        const message = event.data || {};
        if (message.command === 'syncYamlResult') {
          if (el('yamlEditor') instanceof HTMLTextAreaElement) {
            el('yamlEditor').value = message.yaml || '';
          }
          showMessage('yamlStatus', 'YAML refreshed from the current form state.');
          hideMessage('yamlError');
        } else if (message.command === 'applyYamlResult') {
          if (message.error) {
            showMessage('yamlError', String(message.error));
            return;
          }
          const data = message.data || {};
          if (el('title') instanceof HTMLInputElement) el('title').value = data.title || '';
          if (el('kind') instanceof HTMLSelectElement) el('kind').value = data.kind || 'instruction';
          if (el('priority') instanceof HTMLInputElement) el('priority').value = String(data.priority ?? 100);
          if (el('required') instanceof HTMLInputElement) el('required').checked = Boolean(data.required);
          if (el('body') instanceof HTMLTextAreaElement) el('body').value = data.body || '';
          showMessage('yamlStatus', 'YAML applied to the form state.');
          hideMessage('yamlError');
        }
      });
    })();
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
