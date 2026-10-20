from pathlib import Path
import subprocess,hashlib,json
r=Path.cwd();o=r/'artifacts/m24-g07/apple-jitter/iphone-profile11';o.mkdir(parents=True,exist_ok=True)
base=r/'artifacts/m24-g07/apple-jitter/optimized11/extracted/Payload'
subprocess.run(['ditto',str(base),str(o/'Payload')],check=True)
p=o/'Payload/ShaderLab.app';b=p/'app/bundle.mjs';s=b.read_text()
anchor="        if (this.validate && (0,_platform_validation__WEBPACK_IMPORTED_MODULE_1__.nativePerformanceRequested)())\n"
assert s.count(anchor)==1
instrument='''        if (this.validate && (0,_platform_validation__WEBPACK_IMPORTED_MODULE_1__.nativePerformanceRequested)()) {
            globalThis.__hyProfile = { active:false, spans:[], depth:0, cache:{hit:0,miss:0,invalidations:0,fields:{}} };
            globalThis.__hyMeasure=(label,fn)=>{const p=globalThis.__hyProfile;if(!p?.active)return fn();const depth=p.depth++,start=CACurrentMediaTime()*1000;try{return fn();}finally{p.depth--;p.spans.push({label,depth,start,end:CACurrentMediaTime()*1000});}};
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
v=p/'app/vendor.mjs';vs=v.read_text()
measure=lambda label,code: "(globalThis.__hyMeasure ?? ((_label,fn)=>fn()))('"+label+"',()=>{"+code+"});"
for label,code in [
 ('native.validate',';(0,_haiyue_ui_core__WEBPACK_IMPORTED_MODULE_16__.hyValidateProps)(node.kind, node.props, { key: node.key, ...(node.source ? { source: node.source } : {}) }, this.capabilities);'),
 ('native.control','e.control?.update(node, revision);'),
 ('native.accessibility','this.#accessibility(e);'),
 ('native.clipping','this.#applyNative(e);'),
 ('select.text',"title.write(props.options.find(o => o.value === props.value)?.label ?? '');"),
 ('select.controller','controller.update(props);')]:
 assert code in vs,label
 vs=vs.replace(code,measure(label,code))
vs=vs.replace('if (owner !== native || next.some((value, i) => !Object.is(value, signature[i]))) {', "if (owner !== native || next.some((value, i) => !Object.is(value, signature[i]))) { if(globalThis.__hyProfile?.active){const c=globalThis.__hyProfile.cache;c.invalidations++;next.forEach((v,i)=>{if(!Object.is(v,signature[i]))c.fields[i]=(c.fields[i]??0)+1;});}")
vs=vs.replace('if (title) {\n', 'if (title) { if(globalThis.__hyProfile?.active)globalThis.__hyProfile.cache.hit++;\n')
vs=vs.replace('view.text = text;\n                const rendered', 'view.text = text; if(globalThis.__hyProfile?.active)globalThis.__hyProfile.cache.miss++;\n                const rendered')
v.write_text(vs)
s=b.read_text().replace('samples.push({ scale, handler, settled: now() - start, profile });','samples.push({ scale, handler, settled: now() - start, profile, cache:JSON.parse(JSON.stringify(globalThis.__hyProfile.cache)) });');b.write_text(s)
subprocess.run(['codesign','-d','--extract-certificates=/tmp/shaderlab-iphone-profile11-cert-',str(p)],check=True)
cert=hashlib.sha1(Path('/tmp/shaderlab-iphone-profile11-cert-0').read_bytes()).hexdigest()
subprocess.run(['codesign','--force','--sign',cert,'--preserve-metadata=identifier,entitlements,requirements,flags,runtime',str(p)],check=True)
subprocess.run(['codesign','--verify','--deep','--strict',str(p)],check=True)
subprocess.run(['ditto','-c','-k','--keepParent',str(o/'Payload'),str(o/'ShaderLab-profile.ipa')],check=True)
(o/'identity.json').write_text(json.dumps({'diagnosticOnly':True,'base':'e5ffea126c3643730946653dbf70530eb472cbffdd182ef3ec840d4b2918ce08','artifactSha256':hashlib.sha256((o/'ShaderLab-profile.ipa').read_bytes()).hexdigest(),'method':'Synchronous nested phase timings; original source maps; no acceptance claims'},indent=2))
