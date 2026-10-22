import type { HYIconName } from '@haiyue/ui/core';
/** Vector names are drawn from the same portable paths on all platforms. */
export const editorIcons = Object.freeze({save:'save',export:'export',run:'play',pause:'pause',play:'play',reset:'reset',step:'step'} satisfies Record<string,HYIconName>);
export const editorIconLayout = Object.freeze({width:44,minWidth:44,maxWidth:44,height:44,minHeight:44});
