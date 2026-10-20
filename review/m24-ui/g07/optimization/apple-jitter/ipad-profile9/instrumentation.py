from pathlib import Path
import subprocess,hashlib,json
r=Path.cwd();o=r/'artifacts/m24-g07/apple-jitter/ipad-profile9';o.mkdir(parents=True,exist_ok=True)
base=r/'artifacts/m24-g07/apple-jitter/optimized9/extracted/Payload'
subprocess.run(['ditto',str(base),str(o/'Payload')],check=True)
p=o/'Payload/ShaderLab.app';b=p/'app/bundle.mjs';s=b.read_text()
anchor="        if (this.validate && (0,_platform_validation__WEBPACK_IMPORTED_MODULE_1__.nativePerformanceRequested)())\n"
assert s.count(anchor)==1
instrument='''        if (this.validate && (0,_platform_validation__WEBPACK_IMPORTED_MODULE_1__.nativePerformanceRequested)()) {
            globalThis.__hyProfile = { active:false, spans:[], depth:0 };
            const wrap = (owner, key, label) => {
                const fn=owner[key]; if(typeof fn!=='function') return;
                owner[key]=function(...args) {
                    const profile=globalThis.__hyProfile;
                    if(!profile.active) return fn.apply(this,args);
                    const depth=profile.depth++, start=CACurrentMediaTime()*1000;
                    try { return fn.apply(this,args); }
                    finally { profile.depth--; profile.spans.push({label,depth,start,end:CACurrentMediaTime()*1000}); }
                };
            };
            for(const key of ['dispatch','snapshot','change','replace','edit','update','compile','prepareCompilation']) wrap(this.session.application,key,'application.'+key);
            for(const key of ['draft','legacyScale','compile','message']) wrap(this,key,'mobile.'+key);
            if(this.shared) {
                for(const key of ['dispatch','flush','notify','transaction','scale','compileFlushed']) wrap(this.shared.controller,key,'controller.'+key);
                for(const [i,part] of this.shared.owned.entries()) {
                    wrap(part.renderer,'commit','renderer.'+i+'.commit');
                    for(const key of ['setProps','transaction']) wrap(part.page,key,'page.'+i+'.'+key);
                }
            }
        }
'''
s=s.replace(anchor,instrument+anchor)
s=s.replace('            const start = now();\n            p.scale(scale);\n            const handler = now() - start;', '            globalThis.__hyProfile.spans=[];globalThis.__hyProfile.active=true;\n            const start = now();\n            p.scale(scale);\n            const handler = now() - start;\n            globalThis.__hyProfile.active=false;const profile=globalThis.__hyProfile.spans;')
assert 'const profile=globalThis.__hyProfile.spans' in s
s=s.replace('samples.push({ scale, handler, settled: now() - start });','samples.push({ scale, handler, settled: now() - start, profile });')
b.write_text(s)
subprocess.run(['codesign','-d','--extract-certificates=/tmp/shaderlab-ipad-profile9-cert-',str(p)],check=True)
cert=hashlib.sha1(Path('/tmp/shaderlab-ipad-profile9-cert-0').read_bytes()).hexdigest()
subprocess.run(['codesign','--force','--sign',cert,'--preserve-metadata=identifier,entitlements,requirements,flags,runtime',str(p)],check=True)
subprocess.run(['codesign','--verify','--deep','--strict',str(p)],check=True)
subprocess.run(['ditto','-c','-k','--keepParent',str(o/'Payload'),str(o/'ShaderLab-profile.ipa')],check=True)
(o/'identity.json').write_text(json.dumps({'diagnosticOnly':True,'base':'7400b155137358eaee59f49a11ca0e68a47c00180630f4115c267f15db45fdc6','artifactSha256':hashlib.sha256((o/'ShaderLab-profile.ipa').read_bytes()).hexdigest(),'method':'Synchronous nested phase timings; original source maps; no acceptance claims'},indent=2))
