import type { CodeId, ShaderDiagnostic, ShaderProject, ShaderLanguage } from '../domain/model.js';

export const SHADER_APPLICATION_CONTRACT = 'shaderlab-application/2' as const;

export interface ShaderEnvironment {
  readonly ids: { next(): string };
  readonly clock: { nowISO(): string };
}
export interface ShaderCancelSignal {
  readonly aborted: boolean;
  onAbort(callback: () => void): () => void;
}
export interface ShaderRequest {
  readonly session: string;
  readonly revision: number;
  readonly request: number;
  readonly signal: ShaderCancelSignal;
  /** Captured with the project, including when a queued draft runs later. */
  readonly activePass: CodeId;
}
export type ShaderSourceConverter = (snapshot: Readonly<ShaderProject>, pass: CodeId, target: ShaderLanguage) => Promise<string>;

export interface ShaderServices extends ShaderEnvironment {
  readonly convertSource: ShaderSourceConverter;
  readonly projects: {
    open(context: ShaderRequest): Promise<ShaderProject | null>;
    save(snapshot: Readonly<ShaderProject>, context: ShaderRequest): Promise<'saved' | 'cancelled'>;
    saveDraft(snapshot: Readonly<ShaderProject>, context: ShaderRequest): Promise<void>;
    checkpoint?(snapshot:Readonly<ShaderProject>,context:ShaderRequest):Promise<void>;
  };
  readonly preview: {
    prepare(snapshot: Readonly<ShaderProject>, context: ShaderRequest): Promise<{
      readonly handle: string; readonly diagnostics: readonly ShaderDiagnostic[];
    }>;
    /** Check signal immediately before the atomic swap; no unguarded delayed commit. */
    commit(handle: string, context: ShaderRequest): undefined;
    /** Releases an uncommitted handle. Committed resources belong to the renderer. */
    release(handle: string): void;
    play(value: boolean): void;
    step(): void;
    reset(): void;
  };
}
