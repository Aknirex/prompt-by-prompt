const en_dict: Record<string, string> = {
};

const ja_dict: Record<string, string> = {
};

const es_dict: Record<string, string> = {
};

const ko_dict: Record<string, string> = {
};

const zh_cn_dict: Record<string, string> = {
};

const dictionaries: Record<string, Record<string, string>> = {
  en: en_dict,
  ja: ja_dict,
  es: es_dict,
  ko: ko_dict,
  'zh-cn': zh_cn_dict,
};

export function t(key: string, ...values: Array<string | number | boolean>): string {
  const locale = process.env.VSCODE_NLS_CONFIG ? safeLocale(process.env.VSCODE_NLS_CONFIG) : 'en';
  const template = dictionaries[locale]?.[key] ?? en_dict[key] ?? key;
  let message = template;
  values.forEach((value, index) => {
    message = message.replace(new RegExp(`\\{${index}\\}`, 'g'), String(value));
  });
  return message;
}

function safeLocale(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { locale?: string };
    return parsed.locale?.toLowerCase() ?? 'en';
  } catch {
    return 'en';
  }
}
