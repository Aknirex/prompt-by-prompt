const fs = require('fs');
let code = fs.readFileSync('src/providers/settingsPanel.ts', 'utf8');

const targetHtml = `          <button type="button" class="secondary" onclick="resetGeneratorPrompt()">Reset to Default</button>
        </div>

        <div class="section">
          <h2>Global Rules</h2>
          <div class="hint" style="margin-bottom: 12px;">Customize the global rules (e.g. language preferences) appended to all your generated prompts.</div>

          <div class="form-group">
            <label for="globalRule">Global Rule Segment</label>
            <textarea id="globalRule" rows="5">\${this._escapeHtml(settings.globalRule)}</textarea>
          </div>
        </div>`;

code = code.replace(/<button type="button" class="secondary" onclick="resetGeneratorPrompt\(\)">Reset to Default<\/button>\s*<\/div>/, targetHtml);

code = code.replace(/generatorSystemPrompt: document\.getElementById\('generatorSystemPrompt'\)\.value,/, "generatorSystemPrompt: document.getElementById('generatorSystemPrompt').value,\n          globalRule: document.getElementById('globalRule').value,");

fs.writeFileSync('src/providers/settingsPanel.ts', code);
