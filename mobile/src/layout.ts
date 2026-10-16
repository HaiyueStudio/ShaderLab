export type MobilePane = 'preview' | 'code' | 'channels';
export function mobileLayout(width: number, height: number, pane: MobilePane = 'preview') {
    const split = width >= 720 && height >= 420;
    return { split, preview: split || pane === 'preview', code: split || pane === 'code', channels: pane === 'channels',
        previewFraction: width >= 1100 ? .46 : .43, compact: width < 420, galleryColumns: width >= 1000 ? 3 : width >= 600 ? 2 : 1 };
}
