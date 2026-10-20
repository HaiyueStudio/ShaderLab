import type { ChannelDimension } from './glslChannels.js';

export interface HlslTranslationOptions {
  entryPoint?: 'image' | 'sound' | 'common';
  common?: string;
  channelTypes?: readonly (ChannelDimension | null)[];
}
export interface HlslTranslationResult {
  code: string | null;
  diagnostics: { line: number; column: number; message: string; source?: 'common' | 'pass' }[];
  warnings: string[];
}
export type HlslTranslator = (code: string, options?: HlslTranslationOptions) => Promise<HlslTranslationResult>;
