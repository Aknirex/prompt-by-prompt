import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import {
  PBP_SETTINGS_SCHEMA,
  getPbpSettingDefinition,
  getPbpSettingsByArea,
  getSecretSettingKeys,
} from '../src/domain/settingsSchema';

describe('settingsSchema', () => {
  it('covers every contributed pbp setting in package.json', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
    ) as {
      contributes?: {
        configuration?: {
          properties?: Record<string, unknown>;
        };
      };
    };

    const manifestKeys = Object.keys(packageJson.contributes?.configuration?.properties ?? {}).sort();
    const schemaKeys = PBP_SETTINGS_SCHEMA.map((setting) => setting.key).sort();

    expect(schemaKeys).toEqual(manifestKeys);
  });

  it('does not contain duplicate setting keys', () => {
    const keys = PBP_SETTINGS_SCHEMA.map((setting) => setting.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('marks api key settings as secrets for the vNext migration path', () => {
    const secretKeys = getSecretSettingKeys();

    expect(secretKeys).toEqual(expect.arrayContaining([
      'pbp.openaiApiKey',
      'pbp.claudeApiKey',
      'pbp.groqApiKey',
      'pbp.geminiApiKey',
      'pbp.openrouterApiKey',
      'pbp.deepseekApiKey',
      'pbp.mistralApiKey',
      'pbp.xaiApiKey',
      'pbp.azureApiKey',
    ]));
  });

  it('groups daily run settings separately from advanced policy settings', () => {
    expect(getPbpSettingDefinition('pbp.defaultAgent')?.area).toBe('execution');
    expect(getPbpSettingDefinition('pbp.defaultTarget')?.area).toBe('storage');

    const policySettings = getPbpSettingsByArea('policy');
    expect(policySettings.map((setting) => setting.key)).toContain('pbp.passiveRuleProjection.enabled');
    expect(policySettings.every((setting) =>
      setting.key === 'pbp.defaultRuleFile' || setting.advanced === true
    )).toBe(true);
  });
});

