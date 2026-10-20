import {
  Application,
  Device,
  File,
  isIOS,
  knownFolders,
  path,
} from "@nativescript/core";
import { experimentFlag } from "./flags";
import type { HaiyueEngine } from "@haiyue/engine";
import { getEngineDiagnosticsSnapshot } from "@haiyue/engine/diagnostics";
import type { ShaderApplication } from "../../../../shared/dist/application/application.js";
export const monotonicNow = () =>
  isIOS ? CACurrentMediaTime() * 1000 : java.lang.System.nanoTime() / 1e6;
export interface FrameProbe {
  cpuMs: number;
  frames: number;
  dispose(): void;
}
/** Installed before shader update listeners. Captures the entire JS engine
 * frame including GUI's deferred layout/upload/record, not UIKit composition. */
export function installFrameProbe(engine: HaiyueEngine): FrameProbe {
  let start = 0;
  const probe: FrameProbe = {
    cpuMs: 0,
    frames: 0,
    dispose() {
      engine.off("update", begin);
      engine.off("after-update", end);
    },
  };
  const begin = () => {
    start = monotonicNow();
  };
  const end = () => {
    probe.cpuMs = monotonicNow() - start;
    probe.frames++;
  };
  engine.on("update", begin);
  engine.on("after-update", end);
  return probe;
}
interface Ports {
  frameWorkOptimized?(): boolean;
  previewProfile?(): unknown;
  mode: "shared" | "gui";
  application: ShaderApplication;
  engine: HaiyueEngine;
  probe: FrameProbe;
  disposed(): boolean;
  scale(value: number): void;
  status(): { ready: boolean; frame: number; width: number; height: number };
  surfaceSize(): { width: number; height: number };
  diagnostics(): unknown;
  readPixels(): Promise<{ width: number; height: number; pixels: Uint8Array }>;
}
export const percentile = (values: number[], p = 0.95) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1]!;
export async function measureGuiComparison(p: Ports) {
  const report: any = {
    status: "running",
    schema: 2,
    frameWorkOptimized: p.frameWorkOptimized?.() ?? false,
    mode: p.mode,
    guiImplementation: (globalThis as any).__shaderlabGuiPatch ? (experimentFlag("shaderlab-gui-baseline") === "true" ? "baseline" : "optimized") : "original",
    instrumented: experimentFlag("shaderlab-gui-profile") === "true" || experimentFlag("shaderlab-preview-profile") === "true",
    startedAt: new Date().toISOString(),
    runId: crypto.randomUUID(),
    device: { os: Device.os, version: Device.osVersion, model: Device.model },
    samples: [],
    intervals: [],
    idleFrameCpu: [],
    foregroundContinuous: true,
    limitations: [
      "Semantic commands exclude picker animation and touch-to-display latency.",
      "Engine frame CPU includes deferred GUI work; native UIKit layout/compositor CPU is outside the engine and not measured.",
      "Queue fence measures submitted GPU completion, not physical display presentation.",
      "Engine debug counters disabled in both arms: Canvas returns no object for an empty bind group and Engine debug tracking throws. Resource snapshot only; no draw/upload/GPU duration claim.",
      "GUI uses a full-screen GPU surface; shader target pixels are equal. Additional GUI pixel cost is intentional.",
      "GUI uses direct retained bindings; shared application/controller are identical, but portable UI reconciliation is not used.",
    ],
  };
  const file = File.fromPath(
    path.join(knownFolders.documents().path, "shaderlab-gui-comparison.json"),
  );
  const write = () => file.writeText(JSON.stringify(report, null, 2));
  let interrupted = false;
  const suspended = () => {
    interrupted = true;
    report.foregroundContinuous = false;
  };
  const check = () => {
    if (interrupted || p.disposed())
      throw Error("Comparison interrupted by background/disposal");
  };
  const app = isIOS ? UIApplication.sharedApplication : undefined,
    prior = app?.idleTimerDisabled;
  Application.on(Application.suspendEvent, suspended);
  if (app) app.idleTimerDisabled = true;
  const frame = () =>
    new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;
      const done = () => {
        clearTimeout(timer);
        p.engine.off("after-update", done);
        resolve();
      };
      timer = setTimeout(() => {
        p.engine.off("after-update", done);
        reject(Error("Frame timeout"));
      }, 10000);
      p.engine.on("after-update", done);
    });
  try {
    await write();
    const deadline = Date.now() + 60000;
    while (!p.status().ready) {
      check();
      if (Date.now() > deadline) throw Error("GPU timeout");
      await new Promise((r) => setTimeout(r, 50));
    }
    for (let i = 0; i < 30; i++) {
      await frame();
      check();
    }
    report.shaderSurface = p.surfaceSize();
    report.outputSurface = {
      width: p.engine.width,
      height: p.engine.height,
      logicalWidth: p.engine.displayWidth,
      logicalHeight: p.engine.displayHeight,
    };
    report.initial = p.diagnostics();
    report.resourcesBefore = getEngineDiagnosticsSnapshot(
      p.engine,
    ).gpuResources;
    for (const scale of Array.from({ length: 20 }, () => [
      0.75, 0.5, 0.25, 1, 0.75,
    ]).flat()) {
      check();
      const start = monotonicNow();
      p.scale(scale);
      const handler = monotonicNow() - start;
      const frames: number[] = [];
      let settled = false;
      for (let i = 0; i < 600; i++) {
        await frame();
        check();
        frames.push(p.probe.cpuMs);
        const s = p.status(),
          size = p.surfaceSize();
        const factor = Math.min(
          scale,
          1280 / Math.max(size.width, size.height),
          Math.sqrt(786432 / (size.width * size.height)),
        );
        if (
          p.application.state.compile.status === "ready" &&
          s.frame > 2 &&
          s.width === Math.floor(size.width * factor) &&
          s.height === Math.floor(size.height * factor)
        ) {
          settled = true;
          break;
        }
      }
      if (!settled) throw Error("Preview did not settle");
      const presented = monotonicNow() - start;
      const fence = monotonicNow();
      await p.engine.device.queue.onSubmittedWorkDone();
      check();
      const queueWait = monotonicNow() - fence;
      report.samples.push({
        scale,
        handler,
        engineFrameCpu: percentile(frames),
        handlerPlusNextFrameCpu: handler + frames[0]!,
        settled: presented,
        queueWait,
        submitToComplete: monotonicNow() - start,
        frames,
      });
    }
    let previous = monotonicNow();
    for (let i = 0; i < 150; i++) {
      await frame();
      check();
      const now = monotonicNow();
      if (i >= 30) {
        report.intervals.push(now - previous);
        report.idleFrameCpu.push(p.probe.cpuMs);
      }
      previous = now;
    }
    report.previewProfile = p.previewProfile?.();
    const pixels = await p.readPixels();
    report.readback = {
      width: pixels.width,
      height: pixels.height,
      nonzero: pixels.pixels.some((v, i) => i % 4 !== 3 && v !== 0),
    };
    if (!report.readback.nonzero) throw Error("Blank shader readback");
    report.p95 = Object.fromEntries(
      [
        "handler",
        "engineFrameCpu",
        "handlerPlusNextFrameCpu",
        "settled",
        "queueWait",
        "submitToComplete",
      ].map((key) => [key, percentile(report.samples.map((s: any) => s[key]))]),
    );
    report.p95.cadence = percentile(report.intervals);
    report.p95.idleFrameCpu = percentile(report.idleFrameCpu);
    report.final = p.diagnostics();
    report.resourcesAfter = getEngineDiagnosticsSnapshot(p.engine).gpuResources;
    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    report.error = String(error instanceof Error ? error.stack : error);
  } finally {
    Application.off(Application.suspendEvent, suspended);
    if (app) app.idleTimerDisabled = prior!;
  }
  report.completedAt = new Date().toISOString();
  await write();
  console.log("GUI comparison: " + report.status);
}
