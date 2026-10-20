/** M24 contract v1. Review artifact; not an @haiyue/ui public export. */
export type HYNodeKey = string;
export type HYDispose = () => void;
export type HYReason = 'pointer' | 'keyboard' | 'accessibility';
export interface HYOption { readonly value: string; readonly label: string; readonly disabled?: boolean; }
export interface HYSelectionProps { readonly value: string; readonly options: readonly HYOption[]; readonly disabled?: boolean; }
export interface HYSelectionEvent {
  readonly type: 'valueChange' | 'commit'; readonly key: HYNodeKey;
  readonly value: string; readonly reason: HYReason; readonly transaction: number;
}
export interface HYSelectionView {
  apply(props: HYSelectionProps): void;
  listen(listener: (value: string, reason?: HYReason) => void): HYDispose;
}
export class HYSelectionController {
  constructor(key: HYNodeKey, props: HYSelectionProps, emit: (event: HYSelectionEvent) => void);
  update(props: HYSelectionProps): void;
  attach(view: HYSelectionView): void;
  choose(value: string, reason?: HYReason): boolean;
  pick(open: () => Promise<string | null>, reason?: HYReason): Promise<boolean>;
  cancel(): void;
  dispose(): void;
}
export interface HYStore<S, A> {
  getSnapshot(): Readonly<S>;
  dispatch(action: A): void;
  subscribe<T>(select: (state: Readonly<S>) => T, notify: (value: T) => void,
    equal?: (a: T, b: T) => boolean): HYDispose;
  transaction(run: () => void): void;
  dispose(): void;
}
export interface HYCancelSignal { readonly aborted: boolean; onAbort(callback: () => void): HYDispose; }
export interface HYRequestContext { readonly session: string; readonly revision: number; readonly request: number; readonly signal: HYCancelSignal; }
export type HYLength = number | 'auto';
export interface HYLayout {
  readonly width?: HYLength; readonly height?: HYLength;
  readonly minWidth?: number; readonly maxWidth?: number; readonly minHeight?: number; readonly maxHeight?: number;
  readonly padding?: readonly [number, number, number, number]; readonly gap?: number;
  readonly grow?: number; readonly align?: 'start' | 'center' | 'end' | 'stretch';
  readonly columns?: readonly (number | 'auto' | { readonly grow: number })[];
  readonly rows?: readonly (number | 'auto' | { readonly grow: number })[];
  readonly row?: number; readonly column?: number; readonly clip?: boolean;
}
export interface HYAccessibility {
  readonly label: string; readonly description?: string; readonly error?: string;
  readonly role?: 'button' | 'text' | 'textbox' | 'checkbox' | 'tab' | 'dialog' | 'image' | 'slider' | 'list' | 'tree';
}
export interface HYCommonProps { readonly layout?: HYLayout; readonly a11y?: HYAccessibility; readonly visible?: boolean; }
export interface HYTextProps { readonly value: string; readonly disabled?: boolean; readonly readOnly?: boolean; readonly placeholder?: string; readonly secure?: boolean; }
export interface HYResource { readonly id: string; readonly alt: string; }
export interface HYComponentProps {
  Row: HYCommonProps; Column: HYCommonProps; Grid: HYCommonProps; Overlay: HYCommonProps;
  Scroll: HYCommonProps & { readonly axis: 'horizontal' | 'vertical' };
  Text: HYCommonProps & { readonly text: string; readonly wrap?: boolean };
  Image: HYCommonProps & { readonly resource: HYResource; readonly fit?: 'contain' | 'cover' };
  Icon: HYCommonProps & { readonly resource: HYResource; readonly systemName?: string };
  Button: HYCommonProps & { readonly text: string; readonly disabled?: boolean; readonly busy?: boolean };
  Toggle: HYCommonProps & { readonly checked: boolean; readonly disabled?: boolean };
  Select: HYCommonProps & HYSelectionProps; Tabs: HYCommonProps & HYSelectionProps;
  TextInput: HYCommonProps & HYTextProps;
  TextArea: HYCommonProps & Omit<HYTextProps, 'secure'>;
  Slider: HYCommonProps & { readonly value: number; readonly min: number; readonly max: number; readonly step: number; readonly disabled?: boolean };
  Dialog: HYCommonProps & { readonly open: boolean; readonly title: string; readonly dismissible?: boolean };
  FormGroup: HYCommonProps & { readonly label: string; readonly error?: string };
  PlatformView: HYCommonProps & { readonly slot: string; readonly resourceId: string };
}
export type HYComponentKind = keyof HYComponentProps;
export type HYNode = { [K in HYComponentKind]: {
  readonly key: HYNodeKey; readonly kind: K; readonly props: Readonly<HYComponentProps[K]>;
  readonly children?: readonly HYNode[];
  readonly slots?: Readonly<Record<string, readonly HYNode[]>>;
} }[HYComponentKind];
export interface HYUIEvent {
  readonly key: HYNodeKey; readonly type: 'activate' | 'valueChange' | 'commit' | 'cancel' | 'focus' | 'blur' | 'compositionStart' | 'compositionUpdate' | 'compositionEnd';
  readonly value?: string | number | boolean; readonly reason: HYReason;
  readonly transaction: number; readonly composing?: boolean;
}
export type HYMutation =
  | { readonly type: 'create'; readonly node: HYNode }
  | { readonly type: 'update'; readonly node: HYNode }
  | { readonly type: 'insert' | 'move'; readonly key: HYNodeKey; readonly parent: HYNodeKey | null; readonly before: HYNodeKey | null }
  | { readonly type: 'remove'; readonly key: HYNodeKey };
export interface HYCapabilities {
  readonly contract: 1; readonly backend: 'web' | 'nativescript' | 'desktop';
  readonly components: readonly HYComponentKind[];
  readonly features: readonly string[];
}
export interface HYRenderer {
  readonly capabilities: HYCapabilities;
  mount(emit: (event: HYUIEvent) => void): void;
  commit(revision: number, mutations: readonly HYMutation[]): void;
  focus(key: HYNodeKey): void;
  suspend(): void; resume(): void; dispose(): void;
}
export interface HYPlatformView {
  mount(): void; update(resourceId: string): void;
  layout(bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly scale: number }): void;
  visible(value: boolean): void; focus(): void; dispose(): void;
}
export interface HYTheme {
  readonly color: Readonly<Record<'text' | 'muted' | 'surface' | 'input' | 'accent' | 'danger' | 'border' | 'focus', string>>;
  readonly fontSize: number; readonly lineHeight: number; readonly gap: number; readonly radius: number;
}
