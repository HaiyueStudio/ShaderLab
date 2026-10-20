# Canvas 2.1.18 resource lifetime fixes

Source audited at NativeScript/canvas commit `1fd6ef470dfdfd43b3385fa7ef43feddd1debd06` (tag `2.1.18`). The current Android test device is arm64-v8a.

`canvas-2.1.18-resource-lifetime.patch` fixes three registry lifetimes. It releases the internal `ContextReadBack` texture ID when a surface is unconfigured or dropped. `TextureId` has no destructor: the previous code removed `SurfaceData` but left this texture in the wgpu registry, retaining its device/allocator. `take()` makes unconfigure followed by drop safe; resize/configure retain their existing replacement cleanup. It also restores `shader_module_drop`, which upstream left commented out, and releases finished command encoders: wgpu 29 `command_encoder_finish` creates a separate command-buffer entry and does not remove the encoder. The old `open` guard skipped encoder cleanup after every successful finish. These retained registry objects keep old devices/allocators alive even after the JavaScript wrappers are collected.

The JavaScript compatibility changes in `scripts/patch-canvas.mjs` separately address pending device-loss subscriptions, the error callback retaining the complete device, and completed Android `AsyncCallback` closures retaining resolved devices/pipelines. Every patched package source is checked against its pristine 2.1.18 SHA-256 before replacement. These shims do not claim to release the upstream C++ callback/pipe allocations themselves.

## Rebuild the candidate library

Use a checkout of the exact upstream commit including its workspace crates. Set `CANVAS_SOURCE`, `CARGO_HOME`, `RUSTUP_HOME`, `ANDROID_NDK_HOME`, and put the Rust toolchain on PATH. The first Skia source build also requires Python, a C++ toolchain and Ninja (`SKIA_NINJA_COMMAND` can point to its executable). Then run:

```sh
node mobile/scripts/build-canvas-android.mjs
```

This emits a compressed arm64 library, Cargo lockfile and build identity under `artifacts/canvas-2.1.18-android-arm64`. It does not publish or automatically accept the build. Device validation must still complete 50 actual editor/GPU host lifetimes, verify native view teardown, inspect retired object liveness and compare native/process/system memory. Other ABIs and Apple binaries need separate builds and acceptance.

The checked-in arm64 candidate lives in `../vendor/canvas-2.1.18-android-arm64`. Android build/prepare validates its source-patch and library checksums and replaces only `jni/arm64-v8a/libcanvasnative.so` in the SHA-pinned upstream AAR. Java classes, the V8 binding and other ABIs are preserved byte-for-byte. The original AAR is retained alongside the installed package to make reapplication deterministic. iOS builds do not substitute this Android library.

A diagnostic build passed 50 actual editor/GPU host lifetimes on X4000. Its trace shows finished encoders returning to zero and shader modules no longer accumulating. This is distinct from final-binary acceptance; see `../../review/m24-ui/g07/optimization/android-memory`. It does not claim full native GPU heap accounting or acceptance of other ABIs.

## Apple device candidate

The same Rust lifetime patch is built for `aarch64-apple-ios`, then linked into the Swift `CanvasNative.framework` with `canvas-2.1.18-apple-lifetime.patch`. The Apple patch makes notification closures capture their Canvas weakly and makes the touch handler's back-reference weak. Previously NotificationCenter retained Canvas until a deinit that could never run, and Canvas/handler also retained one another. Use macOS/Xcode, the fixed source revision (including `packages/canvas/src-native/canvas-ios`), the `aarch64-apple-ios` Rust target, `CANVAS_SOURCE`, and the Rust/Ninja environment described above:

```sh
node mobile/scripts/build-canvas-ios.mjs
```

The builder freezes the Cargo lockfile and records Rust/Xcode versions, the source patch, every framework file, and the archive checksum under `artifacts/canvas-2.1.18-ios-arm64`. Copy its framework archive and identity to `mobile/vendor/canvas-2.1.18-ios-arm64` only after reviewing the ABI and build output. The candidate framework requires iOS 13; ShaderLab itself already requires iOS 15.

The upstream Xcode hook sources personal shell profiles and invokes an unpinned nightly. The builder temporarily replaces only that hook with a check for the already-built locked Rust library and restores it in `finally`. Swift changes must match the separate Apple patch exactly; Objective-C sources and committed C headers remain unchanged. The device candidate preserves all 987 upstream `canvas_*` C exports and all upstream Objective-C/Swift exports; see the vendored `apple-abi-check.json`.

The JS iOS view patch additionally uses weak callbacks from a module-level factory, reuses one Objective-C ready-listener class with a weak per-instance owner, and clears background/active/touch blocks before native view disposal. Class creation stays outside the owner-capturing lexical scope. Unit tests exercise real GC with retained native callback stand-ins, live event forwarding, late callbacks, teardown and hash-guarded reapplication.

iOS build/prepare checks the original 2.1.18 framework fingerprint and the candidate archive/file checksums, and replaces only the `ios-arm64` device framework. Simulator and visionOS slices are unchanged and are not covered by device acceptance. The original device framework is retained outside the XCFramework for deterministic reapplication. Ordinary app builds use the vendored candidate and do not require Rust.

Apple lifecycle validation samples Mach `TASK_VM_INFO` physical footprint, resident memory and graphics ledger after each actual page teardown. These process-level observations complement weak references and native view/resource counters; they are not a complete Metal heap inventory. A build identity is not a passing acceptance result: the fresh IPA must run on each device separately.
