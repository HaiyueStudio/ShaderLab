import assert from "node:assert/strict";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
const run = promisify(execFile),
  root = resolve(import.meta.dirname, "../.."),
  device = process.env.DEVICE;
assert.ok(device, "DEVICE must be an Apple CoreDevice ID");
const out = resolve(
  root,
  "artifacts/m24-g07/gui-comparison",
  process.env.DEVICE_LABEL ?? "iphone",
);
assert.ok(process.env.DEVICE_LABEL, "Choose a unique DEVICE_LABEL to preserve every run");
mkdirSync(out, { recursive: true });
assert.equal(readdirSync(out).length, 0, "Use a new DEVICE_LABEL; never overwrite a prior run");
const artifact = resolve(
  root,
  process.env.ARTIFACT ??
    "mobile/platforms/ios/build/Debug-iphoneos/ShaderLab.ipa",
);
const hash = () =>
    createHash("sha256").update(readFileSync(artifact)).digest("hex"),
  artifactSha256 = hash();
const invoke = (args) =>
  run("xcrun", ["devicectl", ...args], {
    cwd: root,
    timeout: 30000,
    maxBuffer: 4 * 1024 * 1024,
  });
const runs = [];
const previewCompare = process.env.PREVIEW_COMPARE === "1";
const previewProfile = process.env.PREVIEW_PROFILE === "1";
const previewBaseline = process.env.PREVIEW_BASELINE === "1";
const instrumented = process.env.PROFILE === "1" || previewProfile;
const pairOnly = process.env.ARMS === "shared,optimized";
assert.ok(!process.env.ARMS || pairOnly, "ARMS must be shared,optimized or omitted");
assert.ok(!(process.env.PROFILE === "1" && pairOnly), "Pair comparison must run without profiling");
assert.ok(!previewCompare || (!instrumented && !previewBaseline), "Four-arm comparison must be uninstrumented with per-arm baseline selection");
const schedule = previewCompare ? [
  ["shared", "optimized", "shared-preview-baseline", "optimized-preview-baseline"],
  ["optimized-preview-baseline", "shared-preview-baseline", "optimized", "shared"],
  ["shared-preview-baseline", "shared", "optimized-preview-baseline", "optimized"],
  ["optimized", "optimized-preview-baseline", "shared", "shared-preview-baseline"],
] : previewProfile ? [["shared", "optimized"]] : pairOnly ? [
  ["shared", "optimized"],
  ["optimized", "shared"],
  ["shared", "optimized"],
  ["optimized", "shared"],
] : instrumented ? [["baseline", "optimized"]] : [
  ["shared", "baseline", "optimized"],
  ["optimized", "shared", "baseline"],
  ["baseline", "optimized", "shared"],
];
const arms = [...new Set(schedule.flat())];
writeFileSync(resolve(out, "plan.json"), JSON.stringify({ device, artifact, artifactSha256, instrumented, previewBaseline, previewProfile, previewCompare, schedule, samplesPerRun: 100, stabilitySpreadThreshold: 1.10, startedAt: new Date().toISOString() }, null, 2) + "\n");
const percentile = (values) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];
for (const [round, order] of schedule.entries())
  for (const arm of order) {
    const mode = arm.startsWith("shared") ? "shared" : "gui";
    const oldPreview = previewBaseline || arm.endsWith("-preview-baseline");
    const start = Date.now(),
      file = resolve(out, `${round}-${arm}.json`);
    await invoke([
      "device",
      "process",
      "launch",
      "--timeout",
      "20",
      "--device",
      device,
      "--terminate-existing",
      "studio.haiyue.shaderlab",
      "--shaderlab-gui-comparison",
      `--shaderlab-ui=${mode}`,
      ...(arm === "baseline" ? ["--shaderlab-gui-baseline"] : []),
      ...(process.env.PROFILE === "1" ? ["--shaderlab-gui-profile"] : []),
      ...(previewProfile ? ["--shaderlab-preview-profile"] : []),
      ...(oldPreview ? ["--shaderlab-preview-baseline"] : []),
    ]);
    let report;
    while (Date.now() - start < 180000) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        await invoke([
          "device",
          "copy",
          "from",
          "--timeout",
          "15",
          "--device",
          device,
          "--domain-type",
          "appDataContainer",
          "--domain-identifier",
          "studio.haiyue.shaderlab",
          "--source",
          "Documents/shaderlab-gui-comparison.json",
          "--destination",
          file,
        ]);
        const value = JSON.parse(readFileSync(file));
        if (
          Date.parse(value.startedAt) < start - 2000 ||
          value.mode !== mode ||
          value.status === "running"
        )
          continue;
        assert.equal(value.status, "passed", value.error);
        report = value;
        break;
      } catch (error) {
        if (error.code === "ERR_ASSERTION") throw error;
      }
    }
    assert.ok(report, "No fresh complete report");
    assert.equal(report.guiImplementation, arm === "baseline" ? "baseline" : "optimized", "Frozen patched IPA must be installed");
    assert.equal(report.instrumented, instrumented);
    if (report.schema >= 2) assert.equal(report.frameWorkOptimized, !oldPreview);
    else assert.ok(!oldPreview && !previewProfile && !previewCompare, "Preview experiments require schema 2");
    assert.equal(report.samples.length, 100);
    assert.equal(report.foregroundContinuous, true);
    assert.equal(report.readback.nonzero, true);
    assert.equal(report.idleFrameCpu.length, 120);
    if (runs.length) {
      assert.deepEqual(report.device, runs[0].device, "Compare on the same device");
      const prior = runs.find(r => r.arm === arm);
      if (prior) assert.deepEqual(report.outputSurface, prior.outputSurface, "Keep each arm at the same orientation and dimensions");
    }
    assert.deepEqual(report.shaderSurface, { width: 512, height: 288 });
    report.p95.handlerPlusSettlingFramesCpu = percentile(
      report.samples.map(
        (s) => s.handler + s.frames.reduce((a, b) => a + b, 0),
      ),
    );
    runs.push({ ...report, round, arm });
    writeFileSync(
      resolve(out, "partial.json"),
      JSON.stringify({ artifactSha256, runs }, null, 2) + "\n",
    );
    console.log(arm, round, report.p95);
  }
const summary = {};
const median = a => {
  const sorted = [...a].sort((x,y) => x-y), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
if (!instrumented) for (const key of Object.keys(runs[0].p95)) {
  const values = Object.fromEntries(arms.map(arm => [arm, runs.filter(r => r.arm === arm).map(r => r.p95[key])]));
  summary[key] = { values, medians: Object.fromEntries(Object.entries(values).map(([k,v]) => [k,median(v)])),
    ...(values.baseline ? { optimizedVsBaseline: median(values.optimized) / median(values.baseline) } : {}),
    optimizedVsNative: median(values.optimized) / median(values.shared),
    ...(previewCompare ? {sharedFrameWorkVsBaseline: median(values.shared) / median(values["shared-preview-baseline"]), guiFrameWorkVsBaseline: median(values.optimized) / median(values["optimized-preview-baseline"])} : {}),
    spreads: Object.fromEntries(Object.entries(values).map(([k,v]) => [k, Math.max(...v)/Math.min(...v)])),
  };
}
assert.equal(hash(), artifactSha256);
writeFileSync(
  resolve(out, "report.json"),
  JSON.stringify(
    {
      status: instrumented ? "profiled" : "measured",
      instrumented,
      schedule,
      previewBaseline,
      previewProfile,
      previewCompare,
      device,
      artifactSha256,
      capturedAt: new Date().toISOString(),
      summary,
      runs,
      conclusion:
        "Experiment, not a replacement for frozen G07 gates. Assess deferred frame CPU and cadence alongside handler; preserve all samples.",
    },
    null,
    2,
  ) + "\n",
);
console.log(summary);
