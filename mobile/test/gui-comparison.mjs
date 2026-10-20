import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
const run = promisify(execFile),
  root = resolve(import.meta.dirname, "../.."),
  device = process.env.DEVICE;
assert.ok(device, "DEVICE must be an iPhone CoreDevice ID");
const out = resolve(
  root,
  "artifacts/m24-g07/gui-comparison",
  process.env.DEVICE_LABEL ?? "iphone",
);
mkdirSync(out, { recursive: true });
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
const percentile = (values) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];
for (let round = 0; round < 3; round++)
  for (const mode of round % 2 ? ["gui", "shared"] : ["shared", "gui"]) {
    const start = Date.now(),
      file = resolve(out, `${round}-${mode}.json`);
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
    assert.equal(report.samples.length, 100);
    assert.equal(report.foregroundContinuous, true);
    assert.deepEqual(report.shaderSurface, { width: 512, height: 288 });
    report.p95.handlerPlusSettlingFramesCpu = percentile(
      report.samples.map(
        (s) => s.handler + s.frames.reduce((a, b) => a + b, 0),
      ),
    );
    runs.push({ ...report, round });
    writeFileSync(
      resolve(out, "partial.json"),
      JSON.stringify({ artifactSha256, runs }, null, 2) + "\n",
    );
    console.log(mode, round, report.p95);
  }
const summary = {};
const median = (a) => [...a].sort((a, b) => a - b)[1],
  spread = (a) => Math.max(...a) / Math.min(...a);
for (const key of Object.keys(runs[0].p95)) {
  const native = runs.filter((r) => r.mode === "shared").map((r) => r.p95[key]),
    gui = runs.filter((r) => r.mode === "gui").map((r) => r.p95[key]);
  summary[key] = {
    nativeMs: native,
    guiMs: gui,
    medianRatio: median(gui) / median(native),
    nativeSpread: spread(native),
    guiSpread: spread(gui),
    stable: spread(native) <= 1.1 && spread(gui) <= 1.1,
  };
}
assert.equal(hash(), artifactSha256);
writeFileSync(
  resolve(out, "report.json"),
  JSON.stringify(
    {
      status: "measured",
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
