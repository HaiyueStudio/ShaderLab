import type { ShaderLanguage } from './project';
const words = new Set('fn var let const override struct return if else for while loop continuing break continue switch case default discard enable true false void in out inout uniform precision highp mediump lowp static cbuffer tbuffer register packoffset groupshared row_major column_major nointerpolation typedef namespace using'.split(' '));
export function shaderSpans(text: string, _language: ShaderLanguage) {
    const spans: {
        start: number;
        end: number;
        color: string;
    }[] = [];
    const tokens = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|@[A-Za-z_]\w*|\b(?:0x[\da-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)[fiu]?\b|\b[A-Za-z_]\w*\b)/g;
    for (const m of text.matchAll(tokens)) {
        const w = m[0];
        let color = '';
        if (w.startsWith('//') || w.startsWith('/*'))
            color = '#748397';
        else if (w.startsWith('#') || w.startsWith('@'))
            color = '#e6a0b5';
        else if (words.has(w))
            color = '#c4a5fa';
        else if (/^(?:(?:bool|float|int|uint|half|double)(?:[1-4](?:x[1-4])?)?|Texture\w*|SamplerState|ConstantBuffer|[fiu]32|[biu]?vec[234](?:[fiu])?|mat[234](?:x[234]f)?|sampler2D|samplerCube|array|texture_\w+)$/.test(w))
            color = '#8ad9cd';
        else if (/^i(?:Time|Resolution|Frame|Mouse|Date|Channel|SampleRate)/.test(w) || /^channel[0-3]$/.test(w))
            color = '#aee879';
        else if (/^\d|^\.\d/.test(w))
            color = '#efbd85';
        else if (/^\s*\(/.test(text.slice(m.index! + w.length)))
            color = '#a6caff';
        if (color)
            spans.push({ start: m.index!, end: m.index! + w.length, color });
    }
    return spans;
}
