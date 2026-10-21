/** ShaderLab's shared presentation contract. Palette follows Haiyue Nightfall.
 * Logical sizes are CSS px / native DIP / GUI logical pixels, never framebuffer pixels. */
export const shaderAppearance = Object.freeze({
  color: Object.freeze({
    canvas:'#080b21', surface:'#10132f', elevated:'#181a40', input:'#0c1029',
    text:'#eef0ff', muted:'#a9add4', accent:'#8177f2', selected:'#554cc6',
    border:'#343765', hover:'#242752', hoverBorder:'#6468aa', focus:'#9c8fff',
    danger:'#dd6f91', disabled:'#656b96', backdrop:'#030414b8',
    saved:'#7ddc92', unsaved:'#ff7e8b',
  }),
  size: Object.freeze({font:14, line:20, gap:8, radius:8, control:44, padding:12, cardRadius:12, dialogPadding:20, dialogTitle:20, dialogWidth:460}),
});
export const shaderTheme = Object.freeze({
  color: Object.freeze({text:shaderAppearance.color.text,muted:shaderAppearance.color.muted,
    surface:shaderAppearance.color.surface,input:shaderAppearance.color.input,accent:shaderAppearance.color.accent,
    danger:shaderAppearance.color.danger,border:shaderAppearance.color.border,focus:shaderAppearance.color.focus}),
  fontSize:shaderAppearance.size.font,lineHeight:shaderAppearance.size.line,gap:shaderAppearance.size.gap,radius:shaderAppearance.size.radius,
});
export const shaderControlLayout = Object.freeze({minHeight:shaderAppearance.size.control,minWidth:64});
export const shaderPreviewModes = Object.freeze([{value:'canvas',label:'Canvas'},{value:'sphere',label:'球体'},{value:'box',label:'立方体'},{value:'torus',label:'圆环'}]);
