export const APP_LOCALES = ['zh-CN', 'en', 'ja'] as const;
export type Locale = typeof APP_LOCALES[number];
export const LOCALE_OPTIONS = Object.freeze([
  {value:'zh-CN', label:'中文'},
  {value:'en', label:'English'},
  {value:'ja', label:'日本語'},
]);
export function isLocale(value:unknown):value is Locale {
  return typeof value==='string'&&(APP_LOCALES as readonly string[]).includes(value);
}
/** Match regional system tags without changing an explicit saved preference. */
export function systemLocale(language:string|undefined):Locale {
  const base=language?.toLowerCase().split(/[-_]/)[0];
  return base==='ja'?'ja':base==='zh'?'zh-CN':'en';
}
export const localeLabel=(locale:Locale)=>LOCALE_OPTIONS.find(option=>option.value===locale)!.label;
