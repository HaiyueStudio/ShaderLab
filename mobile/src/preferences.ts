import { ApplicationSettings } from '@nativescript/core';
import { parsePreferences, preferencesKey, type Preferences } from '../../shared/dist/domain/preferences.js';
import { setLocale } from '../../shared/dist/views/i18n.js';
let value=parsePreferences(ApplicationSettings.getString(preferencesKey,'{}'));setLocale(value.locale);
export const preferences=()=>value;
export function savePreferences(patch:Partial<Preferences>) { const next=parsePreferences(JSON.stringify({...value,...patch}));ApplicationSettings.setString(preferencesKey,JSON.stringify(next));value=next;setLocale(next.locale); }
