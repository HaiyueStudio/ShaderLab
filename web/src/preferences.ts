import { defaultPreferences, parsePreferences, preferencesKey, type Preferences } from '../../shared/dist/domain/preferences.js';
import { setLocale } from '../../shared/dist/views/i18n.js';
let value:Preferences={...defaultPreferences};
try{value=parsePreferences(localStorage.getItem(preferencesKey));}catch{}
setLocale(value.locale);
export const preferences=()=>value;
export function savePreferences(patch:Partial<Preferences>) {
  const next=parsePreferences(JSON.stringify({...value,...patch}));
  localStorage.setItem(preferencesKey,JSON.stringify(next));value=next;setLocale(next.locale);
}
