import { glslParser } from './glslLanguage.js';

const types = /^(?:half|double|float|int|uint|bool)(?:[1-4](?:x[1-4])?)?$|^(?:Texture\w*|RWTexture\w*|SamplerState|SamplerComparisonState|ConstantBuffer|StructuredBuffer|RWStructuredBuffer|ByteAddressBuffer|RWByteAddressBuffer)$/;
const keywords = new Set('static cbuffer tbuffer register packoffset groupshared row_major column_major nointerpolation linear centroid sample noperspective inline typedef namespace using public private export extern'.split(' '));
export const hlslParser: typeof glslParser = {
  ...glslParser,
  token(stream, state) {
    const token = glslParser.token(stream, state), word = stream.current();
    if (token === 'variableName' || token === 'variableName.function') {
      if (types.test(word)) return 'typeName';
      if (keywords.has(word)) return 'keyword';
      if (/^SV_\w+$/.test(word) || word === 'iSampler') return 'variableName.special';
    }
    return token;
  },
};
