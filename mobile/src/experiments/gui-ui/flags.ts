import { Application, isIOS } from "@nativescript/core";
export function experimentFlag(name: string): string | undefined {
  if (isIOS) {
    const args = NSProcessInfo.processInfo.arguments;
    for (let i = 0; i < args.count; i++) {
      const value = String(args.objectAtIndex(i));
      if (value === `--${name}`) return "true";
      if (value.startsWith(`--${name}=`)) return value.slice(name.length + 3);
    }
  } else {
    const intent = Application.android.startActivity?.getIntent();
    return (
      intent?.getStringExtra(name) ??
      (intent?.getBooleanExtra(name, false) ? "true" : undefined)
    );
  }
  return undefined;
}
export const guiExperimentRequested = () =>
  experimentFlag("shaderlab-ui") === "gui";
export const guiComparisonRequested = () =>
  experimentFlag("shaderlab-gui-comparison") === "true";
