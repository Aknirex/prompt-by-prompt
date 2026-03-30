import { AIProvider, ProviderInfo } from '../services/aiService';
import { PromptTemplate, PromptVariable } from '../types/prompt';

export interface PromptEditorStrings {
  defaultLabel: string;
  previewBasedOnForm: string;
  refreshingPreview: string;
  previewUnavailable: string;
  previewStillReflects: string;
  previewUsesContext: string;
  yamlRefreshed: string;
  yamlApplied: string;
  failedToSaveYaml: string;
  nameRequired: string;
  templateRequired: string;
  noSchemaVariables: string;
  variableName: string;
  description: string;
  type: string;
  defaultValue: string;
  placeholder: string;
  enumValues: string;
  required: string;
  multiline: string;
  remove: string;
  whatShouldUserProvide: string;
  optional: string;
  shownDuringInput: string;
}

export interface PromptEditorHtmlOptions {
  prompt?: PromptTemplate;
  providers: ProviderInfo[];
  defaultProvider: AIProvider;
  builtinVariables: string[];
  strings: PromptEditorStrings;
  defaultTarget: 'workspace' | 'global';
  initialYamlDraft: string;
}

export function buildPromptEditorHtml(options: PromptEditorHtmlOptions): string {
  const { prompt, providers, defaultProvider, builtinVariables, strings, defaultTarget, initialYamlDraft } = options;
  const promptTarget = prompt?.source === 'workspace' ? 'workspace' : prompt?.source === 'global' ? 'global' : defaultTarget;
  const builtinCards = builtinVariables.map((variable) => `<div class="builtin-card"><code>{{${escapeHtml(variable)}}}</code></div>`).join('');
  const providerOptions = providers.map((provider) => `<option value="${escapeHtml(provider.id)}"${provider.id === defaultProvider ? ' selected' : ''}>${escapeHtml(provider.name)}</option>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${prompt ? 'Edit Prompt' : 'Create New Prompt'}</title>
  <style>
    body{margin:0;padding:20px;font-family:var(--vscode-font-family);color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)}
    .container{max-width:1180px;margin:0 auto;display:grid;gap:16px}
    .section{border:1px solid var(--vscode-panel-border);background:color-mix(in srgb,var(--vscode-sideBar-background) 72%,transparent);padding:16px}
    .row,.toolbar,.actions,.grid{display:flex;gap:12px;justify-content:space-between;align-items:center}
    .grid{align-items:flex-start}
    .grid-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
    .layout{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(320px,0.9fr);gap:16px}
    .form-group{margin-bottom:14px}
    label{display:block;margin-bottom:6px;font-weight:600}
    input[type="text"],select,textarea{width:100%;padding:9px 12px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);font:inherit}
    textarea{resize:vertical;min-height:140px;font-family:var(--vscode-editor-font-family)}
    textarea.template{min-height:300px}
    .hint,.subtle{color:var(--vscode-descriptionForeground);font-size:.9em;line-height:1.45}
    .builtin-grid,.variables-list{display:grid;gap:8px}
    .builtin-grid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-top:12px}
    .builtin-card,.variable-item{border:1px solid var(--vscode-panel-border);background:var(--vscode-editor-background)}
    .builtin-card{padding:10px}
    .variable-item{padding:12px}
    .variable-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 12px}
    .checkbox-inline{display:flex;gap:8px;align-items:center;padding-top:28px}
    .checkbox-inline input{width:auto;margin:0}
    .editor-mode-buttons{display:inline-flex;border:1px solid var(--vscode-panel-border)}
    .editor-mode-btn{background:transparent;color:var(--vscode-editor-foreground);border:none;padding:8px 14px}
    .editor-mode-btn.active{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
    .editor-mode-panel{display:none}
    .editor-mode-panel.active{display:block}
    .preview-panel{display:grid;gap:10px;position:sticky;top:16px}
    .preview-box{min-height:260px;padding:12px;border:1px solid var(--vscode-panel-border);background:var(--vscode-editor-background);white-space:pre-wrap;overflow:auto}
    .message{display:none;padding:10px 12px;border:1px solid transparent;margin-top:10px}
    .message.active{display:block}
    .message.info{background:color-mix(in srgb,var(--vscode-textLink-foreground) 12%,transparent);border-color:var(--vscode-panel-border)}
    .message.error{background:var(--vscode-inputValidation-errorBackground);color:var(--vscode-inputValidation-errorForeground);border-color:var(--vscode-inputValidation-errorForeground)}
    .loading{display:none;align-items:center;gap:8px;margin-top:12px;color:var(--vscode-descriptionForeground)}
    .loading.active{display:flex}
    .spinner{width:14px;height:14px;border:2px solid var(--vscode-progressBar-background);border-right-color:transparent;border-radius:50%;animation:spin .9s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
    button{padding:8px 16px;border:none;cursor:pointer;font:inherit}
    button:disabled{opacity:.6;cursor:not-allowed}
    .primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
    .secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
    .target-select{display:flex;gap:16px;flex-wrap:wrap;margin-top:8px}
    .target-select label{display:flex;gap:6px;align-items:center;font-weight:500}
    .yaml-toolbar,.template-toolbar,.variables-toolbar,.editor-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}
    .yaml-editor{min-height:380px;font-family:var(--vscode-editor-font-family)}
    .actions{border-top:1px solid var(--vscode-panel-border);padding-top:16px}
    .actions-right{display:flex;gap:12px}
    .pill{padding:4px 8px;border:1px solid var(--vscode-panel-border);background:color-mix(in srgb,var(--vscode-badge-background) 24%,transparent);color:var(--vscode-badge-foreground)}
    @media (max-width: 1060px){.grid-two,.layout{grid-template-columns:1fr}.preview-panel{position:static}}
  </style>
</head>
<body>
  <div class="container">
    <div class="row" style="border-bottom:1px solid var(--vscode-panel-border);padding-bottom:12px;">
      <div><h1>${prompt ? 'Edit Prompt' : 'Create New Prompt'}</h1><div class="hint">Edit metadata, template, variables, and YAML in one place.</div></div>
      <div class="pill">${prompt ? 'Editing' : 'New'}</div>
    </div>

    <div class="section">
      <div class="template-toolbar"><div><h2>Prompt Generator</h2><div class="subtle">Describe the task and let the provider draft a prompt.</div></div><button type="button" class="primary" id="generateBtn" data-action="generate">Generate</button></div>
      <div class="form-group"><label for="generateInput">What should this prompt help with?</label><textarea id="generateInput" placeholder="Example: write a concise code review prompt for TypeScript changes"></textarea></div>
      <div class="row">
        <div class="form-group" style="flex:1"><label for="genProvider">Provider</label><select id="genProvider">${providerOptions}</select></div>
        <div class="form-group" style="flex:1"><label for="genModel">Model</label><select id="genModel"><option value="">${strings.defaultLabel}</option></select></div>
      </div>
      <div class="loading" id="loadingIndicator"><div class="spinner"></div><span>Generating prompt...</span></div>
      <div class="message error" id="errorMessage"></div>
    </div>

    <div class="section">
      <div class="grid-two">
        <div>
          <h2>Prompt Metadata</h2>
          <div class="form-group"><label for="name">Name *</label><input type="text" id="name" value="${escapeHtml(prompt?.name || '')}"></div>
          <div class="form-group"><label for="category">Category</label><input type="text" id="category" value="${escapeHtml(prompt?.category || '')}"></div>
          <div class="form-group"><label for="description">Description</label><input type="text" id="description" value="${escapeHtml(prompt?.description || '')}"></div>
          <div class="form-group"><label for="tags">Tags</label><input type="text" id="tags" value="${escapeHtml((prompt?.tags || []).join(', '))}"></div>
          <div class="form-group"><label>Save Location</label><div class="target-select"><label><input type="radio" name="target" value="workspace"${promptTarget === 'workspace' ? ' checked' : ''}>Workspace</label><label><input type="radio" name="target" value="global"${promptTarget === 'global' ? ' checked' : ''}>Global</label></div></div>
        </div>
        <div class="preview-panel"><div><h2>Prompt Preview</h2><div class="hint" id="previewStatus">${strings.previewBasedOnForm}</div><div class="message error" id="previewError"></div></div><pre class="preview-box" id="previewBox"></pre></div>
      </div>
    </div>

    <div class="section">
      <div class="editor-head"><div><h2>Prompt Editor</h2><div class="subtle">Switch between form and YAML source views.</div></div><div class="editor-mode-buttons"><button type="button" class="editor-mode-btn active" data-action="mode" data-mode="form">Form View</button><button type="button" class="editor-mode-btn" data-action="mode" data-mode="yaml">YAML View</button></div></div>
      <div class="editor-mode-panel active" id="editor-panel-form">
        <div class="layout">
          <div>
            <div class="template-toolbar"><div><h2>Prompt Template</h2><div class="subtle">Edit the core prompt text directly here.</div></div><button type="button" class="secondary" data-action="preview">Refresh Preview</button></div>
            <div class="form-group"><label for="template">Prompt *</label><textarea id="template" class="template">${escapeHtml(prompt?.template || '')}</textarea></div>
            <div>
              <div class="variables-toolbar"><div><h2>Variable Schema</h2><div class="subtle">Define values the user should supply at run time.</div></div><button type="button" class="secondary" data-action="add-variable">Add Variable</button></div>
              <div class="variables-list" id="variables-list">${renderVariables(prompt?.variables || [], strings)}</div>
            </div>
          </div>
          <div><div class="section"><h2>Built-in Variables</h2><div class="subtle">These come from the active editor and do not need to be declared.</div><div class="builtin-grid">${builtinCards}</div></div></div>
        </div>
      </div>
      <div class="editor-mode-panel" id="editor-panel-yaml">
        <div class="yaml-toolbar"><button type="button" class="secondary" data-action="preview">Refresh Preview</button><button type="button" class="secondary" data-action="sync-yaml">Sync Form to YAML</button><button type="button" class="secondary" data-action="apply-yaml">Apply YAML to Form</button></div>
        <div class="form-group"><label for="yamlEditor">Prompt Definition</label><textarea id="yamlEditor" class="yaml-editor">${initialYamlDraft}</textarea></div>
        <div class="message info" id="yamlStatus"></div><div class="message error" id="yamlError"></div>
      </div>
    </div>

    <div class="actions"><div class="hint">Prompt editor only manages the template. Choose agent, behavior, and dispatch target when you run it.</div><div class="actions-right"><button type="button" class="secondary" data-action="cancel">Cancel</button><button type="button" class="primary" data-action="save">Save Prompt</button></div></div>
  </div>

  <script>
    (() => {
      const vscode = acquireVsCodeApi();
      const providers = ${JSON.stringify(providers)};
      const strings = ${JSON.stringify(strings)};
      const state = { mode: 'form', previewTimer: undefined, variableCount: ${prompt?.variables?.length || 0} };
      const el = (id) => document.getElementById(id);
      const q = (root, selector) => root.querySelector(selector);
      const setActive = (node, active) => node && node.classList.toggle('active', active);

      const updateModels = () => {
        const providerSelect = el('genProvider');
        const modelSelect = el('genModel');
        if (!(providerSelect instanceof HTMLSelectElement) || !(modelSelect instanceof HTMLSelectElement)) return;
        const provider = providers.find((entry) => entry.id === providerSelect.value);
        const current = modelSelect.value;
        modelSelect.innerHTML = '<option value="">' + strings.defaultLabel + '</option>';
        (provider?.models || []).forEach((model) => {
          const option = document.createElement('option');
          option.value = model;
          option.textContent = model;
          modelSelect.appendChild(option);
        });
        if (current && Array.from(modelSelect.options).some((option) => option.value === current)) {
          modelSelect.value = current;
        }
      };

      const schedulePreview = () => {
        clearTimeout(state.previewTimer);
        state.previewTimer = setTimeout(requestPreview, 220);
      };

      const collectVariables = () => {
        const variables = [];
        document.querySelectorAll('.variable-item').forEach((item) => {
          if (!(item instanceof HTMLElement)) return;
          const name = q(item, '.var-name')?.value?.trim();
          if (!name) return;
          const type = q(item, '.var-type')?.value || 'string';
          const defaultValueRaw = q(item, '.var-default')?.value ?? '';
          const values = (q(item, '.var-values')?.value || '').split(',').map((value) => value.trim()).filter(Boolean);
          let normalizedDefault = defaultValueRaw;
          if (type === 'number' && defaultValueRaw !== '') normalizedDefault = Number(defaultValueRaw);
          if (type === 'boolean' && defaultValueRaw !== '') normalizedDefault = defaultValueRaw === 'true';
          variables.push({
            name,
            description: q(item, '.var-desc')?.value?.trim() || name,
            type,
            required: q(item, '.var-required')?.checked || false,
            default: defaultValueRaw === '' ? undefined : normalizedDefault,
            placeholder: q(item, '.var-placeholder')?.value?.trim() || undefined,
            multiline: q(item, '.var-multiline')?.checked || false,
            values: type === 'enum' && values.length > 0 ? values : undefined,
          });
        });
        return variables;
      };

      const collectFormState = () => ({
        name: el('name') instanceof HTMLInputElement ? el('name').value.trim() : '',
        category: el('category') instanceof HTMLInputElement ? el('category').value.trim() : '',
        description: el('description') instanceof HTMLInputElement ? el('description').value.trim() : '',
        tags: el('tags') instanceof HTMLInputElement ? el('tags').value.split(',').map((tag) => tag.trim()).filter(Boolean) : [],
        template: el('template') instanceof HTMLTextAreaElement ? el('template').value : '',
        variables: collectVariables(),
      });

      const requestPreview = () => {
        const previewStatus = el('previewStatus');
        const previewError = el('previewError');
        const template = el('template');
        if (previewStatus) {
          previewStatus.textContent = state.mode === 'yaml' ? strings.previewBasedOnForm : strings.refreshingPreview;
          previewStatus.classList.add('active');
        }
        if (previewError) previewError.classList.remove('active');
        if (template instanceof HTMLTextAreaElement) {
          vscode.postMessage({ command: 'preview', data: { template: template.value, variables: collectVariables() } });
        }
      };

      const applyFormState = (data) => {
        if (el('name')) el('name').value = data.name || '';
        if (el('category')) el('category').value = data.category || '';
        if (el('description')) el('description').value = data.description || '';
        if (el('tags')) el('tags').value = Array.isArray(data.tags) ? data.tags.join(', ') : '';
        if (el('template')) el('template').value = data.template || '';
        renderVariables(Array.isArray(data.variables) ? data.variables : []);
      };

      const renderVariables = (variables) => {
        const list = el('variables-list');
        if (!list) return;
        list.innerHTML = '';
        state.variableCount = 0;
        if (!variables.length) {
          list.innerHTML = '<div class="hint">' + strings.noSchemaVariables + '</div>';
          return;
        }
        variables.forEach((variable) => addVariable(variable));
      };

      const createVariableMarkup = (variable = {}) => {
        const values = Array.isArray(variable.values) ? variable.values.join(', ') : '';
        const selectedType = variable.type || 'string';
        const defaultValue = variable.default === undefined ? '' : String(variable.default);
        const item = document.createElement('div');
        item.className = 'variable-item';
        item.innerHTML = [
          '<div class="variable-grid">',
          '<div class="form-group"><label>' + strings.variableName + ' *</label><input type="text" class="var-name"></div>',
          '<div class="form-group"><label>' + strings.description + '</label><input type="text" class="var-desc" placeholder="' + strings.whatShouldUserProvide + '"></div>',
          '<div class="form-group"><label>' + strings.type + '</label><select class="var-type"><option value="string">string</option><option value="number">number</option><option value="boolean">boolean</option><option value="enum">enum</option></select></div>',
          '<div class="form-group"><label>' + strings.defaultValue + '</label><input type="text" class="var-default" placeholder="' + strings.optional + '"></div>',
          '<div class="form-group"><label>' + strings.placeholder + '</label><input type="text" class="var-placeholder" placeholder="' + strings.shownDuringInput + '"></div>',
          '<div class="form-group var-values-group" style="display:none;"><label>' + strings.enumValues + '</label><input type="text" class="var-values" placeholder="low, medium, high"></div>',
          '<div class="checkbox-inline"><input type="checkbox" class="var-required"><label>' + strings.required + '</label></div>',
          '<div class="checkbox-inline"><input type="checkbox" class="var-multiline"><label>' + strings.multiline + '</label></div>',
          '</div>',
          '<div style="margin-top:10px;display:flex;justify-content:flex-end;"><button type="button" class="secondary" data-action="remove-variable">' + strings.remove + '</button></div>',
        ].join('');

        const nameInput = item.querySelector('.var-name');
        const descInput = item.querySelector('.var-desc');
        const typeSelect = item.querySelector('.var-type');
        const defaultInput = item.querySelector('.var-default');
        const placeholderInput = item.querySelector('.var-placeholder');
        const valuesInput = item.querySelector('.var-values');
        const requiredInput = item.querySelector('.var-required');
        const multilineInput = item.querySelector('.var-multiline');
        const valuesGroup = item.querySelector('.var-values-group');

        if (nameInput) nameInput.value = variable.name || '';
        if (descInput) descInput.value = variable.description || '';
        if (typeSelect instanceof HTMLSelectElement) typeSelect.value = selectedType;
        if (defaultInput instanceof HTMLInputElement) defaultInput.value = defaultValue;
        if (placeholderInput instanceof HTMLInputElement) placeholderInput.value = variable.placeholder || '';
        if (valuesInput instanceof HTMLInputElement) valuesInput.value = values;
        if (requiredInput instanceof HTMLInputElement) requiredInput.checked = Boolean(variable.required);
        if (multilineInput instanceof HTMLInputElement) multilineInput.checked = Boolean(variable.multiline);
        if (valuesGroup instanceof HTMLElement) valuesGroup.style.display = selectedType === 'enum' ? 'block' : 'none';

        return item;
      };

      const addVariable = (variable = {}) => {
        const list = el('variables-list');
        if (!list) return;
        const empty = list.querySelector('.hint');
        if (empty) empty.remove();
        const item = createVariableMarkup(variable);
        list.appendChild(item);
        bindVariableInputs(item);
        state.variableCount += 1;
        schedulePreview();
      };

      const bindVariableInputs = (root) => {
        root.querySelectorAll('input, select, textarea').forEach((node) => {
          node.addEventListener('input', schedulePreview);
          node.addEventListener('change', schedulePreview);
        });
      };

      const handleVariableTypeChange = (select) => {
        const item = select.closest('.variable-item');
        if (!item) return;
        const valuesGroup = item.querySelector('.var-values-group');
        if (valuesGroup) valuesGroup.style.display = select.value === 'enum' ? 'block' : 'none';
        schedulePreview();
      };

      const removeVariable = (button) => {
        const item = button.closest('.variable-item');
        if (item) item.remove();
        const list = el('variables-list');
        if (list && list.children.length === 0) {
          list.innerHTML = '<div class="hint">' + strings.noSchemaVariables + '</div>';
        }
        schedulePreview();
      };

      const showEditorMode = (mode) => {
        state.mode = mode === 'yaml' ? 'yaml' : 'form';
        const formPanel = el('editor-panel-form');
        const yamlPanel = el('editor-panel-yaml');
        const formBtn = document.querySelector('[data-mode="form"]');
        const yamlBtn = document.querySelector('[data-mode="yaml"]');
        if (formPanel) formPanel.classList.toggle('active', state.mode === 'form');
        if (yamlPanel) yamlPanel.classList.toggle('active', state.mode === 'yaml');
        if (formBtn) formBtn.classList.toggle('active', state.mode === 'form');
        if (yamlBtn) yamlBtn.classList.toggle('active', state.mode === 'yaml');
      };

      const setYamlInfo = (message, isError) => {
        const status = el('yamlStatus');
        const error = el('yamlError');
        if (isError) {
          if (error) { error.textContent = message; error.classList.add('active'); }
          if (status) status.classList.remove('active');
        } else {
          if (status) { status.textContent = message; status.classList.add('active'); }
          if (error) error.classList.remove('active');
        }
      };

      const syncFormToYaml = () => vscode.postMessage({ command: 'syncYaml', data: collectFormState() });
      const applyYamlToForm = () => {
        const yamlEditor = el('yamlEditor');
        if (yamlEditor instanceof HTMLTextAreaElement) {
          vscode.postMessage({ command: 'applyYaml', data: { yamlText: yamlEditor.value } });
        }
      };

      const generatePrompt = () => {
        const description = el('generateInput') instanceof HTMLTextAreaElement ? el('generateInput').value.trim() : '';
        const provider = el('genProvider') instanceof HTMLSelectElement ? el('genProvider').value : '';
        const model = el('genModel') instanceof HTMLSelectElement ? el('genModel').value : '';
        vscode.postMessage({ command: 'generate', data: { description, provider, model } });
      };

      const savePrompt = () => {
        const target = document.querySelector('input[name="target"]:checked')?.value || '${defaultTarget}';
        if (state.mode === 'yaml') {
          const yamlEditor = el('yamlEditor');
          if (yamlEditor instanceof HTMLTextAreaElement) {
            vscode.postMessage({ command: 'saveFromYaml', data: { yamlText: yamlEditor.value, target } });
          }
          return;
        }
        const { name, category, description, tags, template, variables } = collectFormState();
        if (!name) return void alert(strings.nameRequired);
        if (!template.trim()) return void alert(strings.templateRequired);
        vscode.postMessage({ command: 'save', data: { name, description, category, tags, template, variables: variables.length ? variables : undefined, target } });
      };

      const escapeHtml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

      document.addEventListener('click', (event) => {
        const actionNode = event.target instanceof Element ? event.target.closest('[data-action]') : null;
        if (!actionNode) return;
        const action = actionNode.getAttribute('data-action');
        if (action === 'generate') generatePrompt();
        else if (action === 'preview') requestPreview();
        else if (action === 'sync-yaml') syncFormToYaml();
        else if (action === 'apply-yaml') applyYamlToForm();
        else if (action === 'add-variable') addVariable();
        else if (action === 'remove-variable') removeVariable(actionNode);
        else if (action === 'cancel') vscode.postMessage({ command: 'cancel' });
        else if (action === 'save') savePrompt();
        else if (action === 'mode') showEditorMode(actionNode.getAttribute('data-mode') || 'form');
      });

      document.addEventListener('change', (event) => {
        const target = event.target;
        if (target instanceof HTMLSelectElement && target.id === 'genProvider') {
          updateModels();
          schedulePreview();
        } else if (target instanceof HTMLSelectElement && target.classList.contains('var-type')) {
          handleVariableTypeChange(target);
        } else if (target instanceof HTMLInputElement && (target.classList.contains('var-required') || target.classList.contains('var-multiline'))) {
          schedulePreview();
        }
      });

      document.addEventListener('input', (event) => {
        const target = event.target;
        if (target instanceof HTMLElement && target.closest('#editor-panel-form')) {
          schedulePreview();
        }
      });

      window.addEventListener('message', (event) => {
        const message = event.data || {};
        switch (message.command) {
          case 'generateStart':
            setActive(el('loadingIndicator'), true);
            if (el('generateBtn')) el('generateBtn').disabled = true;
            setActive(el('errorMessage'), false);
            break;
          case 'generateResult':
            setActive(el('loadingIndicator'), false);
            if (el('generateBtn')) el('generateBtn').disabled = false;
            if (message.draft) {
              applyFormState(message.draft);
              syncFormToYaml();
              requestPreview();
            } else if (message.error && el('errorMessage')) {
              el('errorMessage').textContent = message.error;
              el('errorMessage').classList.add('active');
            }
            break;
          case 'previewResult':
            if (message.error) {
              if (el('previewError')) { el('previewError').textContent = message.error; el('previewError').classList.add('active'); }
              if (el('previewStatus')) el('previewStatus').textContent = strings.previewUnavailable;
              if (el('previewBox')) el('previewBox').textContent = '';
            } else {
              if (el('previewError')) el('previewError').classList.remove('active');
              if (el('previewStatus')) el('previewStatus').textContent = state.mode === 'yaml' ? strings.previewStillReflects : strings.previewUsesContext;
              if (el('previewBox')) el('previewBox').textContent = message.preview || '';
            }
            break;
          case 'syncYamlResult':
            if (el('yamlEditor')) el('yamlEditor').value = message.yaml || '';
            setYamlInfo(strings.yamlRefreshed, false);
            break;
          case 'applyYamlResult':
            if (message.error) {
              setYamlInfo(message.error, true);
              return;
            }
            applyFormState(message.data);
            syncFormToYaml();
            showEditorMode('form');
            requestPreview();
            setYamlInfo(strings.yamlApplied, false);
            break;
          case 'saveError':
            setYamlInfo(message.error || strings.failedToSaveYaml, true);
            break;
          case 'showError':
            alert(message.data?.message || 'Unknown error');
            break;
        }
      });

      const start = () => {
        updateModels();
        showEditorMode('form');
        requestPreview();
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
      } else {
        start();
      }
    })();
  </script>
</body>
</html>`;
}

function renderVariables(variables: PromptVariable[], strings: PromptEditorStrings): string {
  if (!variables.length) {
    return `<div class="hint">${strings.noSchemaVariables}</div>`;
  }

  return variables.map((variable) => {
    const enumValues = variable.values?.join(', ') || '';
    const defaultValue = variable.default === undefined ? '' : String(variable.default);
    const type = variable.type || 'string';
    return `
      <div class="variable-item">
        <div class="variable-grid">
          <div class="form-group"><label>${strings.variableName} *</label><input type="text" class="var-name" value="${escapeHtml(variable.name)}"></div>
          <div class="form-group"><label>${strings.description}</label><input type="text" class="var-desc" value="${escapeHtml(variable.description || '')}" placeholder="${strings.whatShouldUserProvide}"></div>
          <div class="form-group"><label>${strings.type}</label><select class="var-type"><option value="string"${type === 'string' ? ' selected' : ''}>string</option><option value="number"${type === 'number' ? ' selected' : ''}>number</option><option value="boolean"${type === 'boolean' ? ' selected' : ''}>boolean</option><option value="enum"${type === 'enum' ? ' selected' : ''}>enum</option></select></div>
          <div class="form-group"><label>${strings.defaultValue}</label><input type="text" class="var-default" value="${escapeHtml(defaultValue)}" placeholder="${strings.optional}"></div>
          <div class="form-group"><label>${strings.placeholder}</label><input type="text" class="var-placeholder" value="${escapeHtml(variable.placeholder || '')}" placeholder="${strings.shownDuringInput}"></div>
          <div class="form-group var-values-group" style="display:${type === 'enum' ? 'block' : 'none'};"><label>${strings.enumValues}</label><input type="text" class="var-values" value="${escapeHtml(enumValues)}" placeholder="low, medium, high"></div>
          <div class="checkbox-inline"><input type="checkbox" class="var-required"${variable.required ? ' checked' : ''}><label>${strings.required}</label></div>
          <div class="checkbox-inline"><input type="checkbox" class="var-multiline"${variable.multiline ? ' checked' : ''}><label>${strings.multiline}</label></div>
        </div>
        <div style="margin-top:10px;display:flex;justify-content:flex-end;"><button type="button" class="secondary" data-action="remove-variable">${strings.remove}</button></div>
      </div>
    `;
  }).join('');
}

function escapeHtml(value: string): string {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
