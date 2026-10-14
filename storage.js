/* GNSS V19 static storage adapter. No network/server needed. */
(()=>{'use strict';
const KEY='gnss_v19_static_v1';
const defaults={grouping_threshold:.1,precision_class:'甲二',coordinate_system:2,observation_method:'ネットワーク型RTK法による単点観測法',geodetic_system:'世界測地系（測地成果2011）',equipment:'GNSS測量機・トータルステーション'};
const rules={'甲二':60,'甲三':100,'乙一':120,'乙二':160,'乙三':200};
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random();
const now=()=>new Date().toISOString().slice(0,19).replace('T',' ');
const num=x=>x===null||x===undefined||x===''?null:(Number.isFinite(Number(x))?Number(x):null);
const saved=()=>{try {return JSON.parse(localStorage.getItem(KEY))||null}catch{return null}};
let db=saved()||{settings:{...defaults},projects:[]};
function store(){try{localStorage.setItem(KEY,JSON.stringify(db))}catch(e){throw Error('保存領域が不足しています。JSONバックアップを取って不要な案件を整理してください。')}}
function project(pid){const p=db.projects.find(x=>x.id===pid);if(!p)throw Error('案件が見つかりません');return p}
function touch(p){p.updated_at=now()}
function regroup(p){const th=Number(p.grouping_threshold),list=[...p.observations].sort((a,b)=>(a.observed_at||'').localeCompare(b.observed_at||'')||(a.point_no||0)-(b.point_no||0));const groups=[];
 for(const o of list){let target=groups.find(g=>Math.hypot(o.x-g.observations.reduce((s,z)=>s+z.x,0)/g.observations.length,o.y-g.observations.reduce((s,z)=>s+z.y,0)/g.observations.length)<=th);if(!target){target={id:uid(),project_id:p.id,label:'',observations:[]};groups.push(target)}target.observations.push(o)}
 groups.forEach((g,i)=>{g.label=[...new Set(g.observations.map(o=>o.point_name))].join(' / ')||'グループ'+(i+1)});p.groups=groups;
 p.known_links={};p.new_points.forEach(n=>Object.assign(n,{group_id:null,main1_id:null,main2_id:null,check1_id:null,check2_id:null}));return groups.length}
function children(el,name){return [...(el?.children||[])].find(x=>x.localName===name)}
function desc(el,name){return [...(el?.getElementsByTagName('*')||[])].find(x=>x.localName===name)}
const val=(el,name)=>children(el,name)?.textContent?.trim()||'';
function parseGpx(t,fid,pid){const xml=new DOMParser().parseFromString(t,'application/xml');if(xml.querySelector('parsererror'))throw Error('GPXのXML形式が不正です');let no=0,out=[];
 for(const w of xml.getElementsByTagName('wpt')){no++;const ct=desc(w,'coordinate_transform'),x=num(val(ct,'x')),y=num(val(ct,'y'));if(x===null||y===null)continue;const m=desc(w,'measurement');out.push({id:uid(),project_id:pid,gpx_file_id:fid,point_no:no,point_name:val(w,'name')||'No.'+no,observed_at:val(w,'time'),x,y,elevation:num(val(w,'ele')),satellites:num(val(w,'sat')),hdop:num(val(w,'hdop')),fix_mode:val(m,'fixMode')||val(w,'fix')})}return out}
function decodeSima(buf){let txt=new TextDecoder('shift_jis').decode(buf);if(txt.includes('�'))txt=new TextDecoder('utf-8').decode(buf);return txt}
function simaRows(t){return t.split(/\r?\n|\r/).map(s=>s.trim().split(',').map(v=>v.trim())).filter(a=>a[0]?.toUpperCase()==='A01'&&a.length>=6).map(a=>({name:a[2]||a[1],x:num(a[3]),y:num(a[4]),z:num(a[5])})).filter(r=>r.x!==null&&r.y!==null)}
function simaOutput(pid){const p=project(pid),rows=[];for(const k of [...p.known_points].sort((a,b)=>a.name.localeCompare(b.name)))rows.push([k.name,k.result_x,k.result_y,k.result_h]);
 for(const n of [...p.new_points].sort((a,b)=>a.name.localeCompare(b.name))){const a=p.observations.find(o=>o.id===n.main1_id),b=p.observations.find(o=>o.id===n.main2_id);if(!a||!b)continue;const zs=[a.elevation,b.elevation].filter(x=>x!==null);rows.push([n.name,(a.x+b.x)/2,(a.y+b.y)/2,zs.length?zs.reduce((s,x)=>s+x,0)/zs.length:null])}
 const clean=s=>String(s||'').replace(/,/g,'_').replace(/[\r\n]/g,' ');return ['A00,',...rows.map(([name,x,y,z],i)=>'A01,'+(i+1)+','+clean(name)+','+x.toFixed(3)+','+y.toFixed(3)+','+(z??0).toFixed(3)+','),'A99,'].join('\r\n')+'\r\n'}
function response(data,code=200){return new Response(JSON.stringify(data),{status:code,headers:{'Content-Type':'application/json;charset=utf-8'}})}
async function handle(url,opt={}){const path=new URL(url,location.href).pathname,parts=path.split('/').filter(Boolean),method=(opt.method||'GET').toUpperCase();if(!path.startsWith('/api/'))return originalFetch(url,opt);
 try{if(parts[1]==='settings'){if(method==='GET')return response(db.settings);db.settings={...db.settings,...JSON.parse(opt.body)};store();return response({ok:1})}
 if(parts[1]==='projects'){if(parts.length===2){if(method==='GET')return response([...db.projects].sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).map(({id,name,location,case_no,updated_at})=>({id,name,location,case_no,updated_at})));const x=JSON.parse(opt.body),id=uid(),time=now();db.projects.push({id,name:String(x.name||'').trim(),location:x.location||'',case_no:x.case_no||'',...db.settings,created_at:time,updated_at:time,known_points:[],gpx_files:[],observations:[],groups:[],known_links:{},new_points:[],distance_checks:[]});store();return response({ok:1,id})}if(method==='DELETE'){db.projects=db.projects.filter(p=>p.id!==parts[2]);store();return response({ok:1})}}
 if(parts[1]!=='project')return response({ok:0,error:'Unknown API'},404);const pid=parts[2],p=project(pid),action=parts[3],id=parts[4],x=method==='POST'&&!(opt.body instanceof FormData)?JSON.parse(opt.body||'{}'):{};
 if(method==='GET'&&action==='state')return response({...p,project:Object.fromEntries(Object.entries(p).filter(([k])=>!['known_points','gpx_files','observations','groups','known_links','new_points','distance_checks'].includes(k))),gpx_files:p.gpx_files.map(f=>({...f,point_count:p.observations.filter(o=>o.gpx_file_id===f.id).length})),rules});
 if(method==='POST'){
 if(action==='project-settings'){Object.assign(p,{grouping_threshold:Number(x.grouping_threshold),precision_class:x.precision_class,coordinate_system:Number(x.coordinate_system),observation_method:x.observation_method||'',geodetic_system:x.geodetic_system||'',equipment:x.equipment||''});touch(p)}
 else if(action==='known'){p.known_points.push({id:uid(),project_id:pid,name:x.name,result_x:Number(x.result_x),result_y:Number(x.result_y),result_h:num(x.result_h)});touch(p)}
 else if(action==='known-link'){p.known_links[x.known_point_id]={known_point_id:x.known_point_id,group_id:x.group_id||null,obs1_id:x.obs1_id||null,obs2_id:x.obs2_id||null}}
 else if(action==='new-point'){const nums=p.new_points.map(n=>/^GT\d+$/.test(n.name)?Number(n.name.slice(2)):0);const name='GT'+String(Math.max(0,...nums)+1).padStart(2,'0');p.new_points.push({id:uid(),project_id:pid,name,group_id:null,main1_id:null,main2_id:null,check1_id:null,check2_id:null});touch(p);store();return response({ok:1,name})}
 else if(action==='new-link'){const n=p.new_points.find(n=>n.id===x.id);if(!n)throw Error('新点が見つかりません');for(const k of ['group_id','main1_id','main2_id','check1_id','check2_id'])n[k]=x[k]||null}
 else if(action==='distance-check'){let r=p.distance_checks.find(r=>r.from_point_id===x.from_point_id&&r.to_point_id===x.to_point_id);if(!r){r={id:uid(),project_id:pid,from_point_id:x.from_point_id,to_point_id:x.to_point_id};p.distance_checks.push(r)}Object.assign(r,{terrain:x.terrain||'flat',ts_distance:num(x.ts_distance)})}
 else if(action==='upload'){let count=0;for(const f of opt.body.values()){if(!(f instanceof File))continue;const fid=uid(),obs=parseGpx(await f.text(),fid,pid);p.gpx_files.push({id:fid,project_id:pid,filename:f.name,imported_at:now()});p.observations.push(...obs);count+=obs.length}const ng=regroup(p);touch(p);store();return response({ok:1,observations:count,groups:ng})}
 else if(action==='sima-upload'){let added=0,skipped=0;for(const f of opt.body.values()){if(!(f instanceof File))continue;for(const r of simaRows(decodeSima(await f.arrayBuffer()))){if(p.known_points.some(k=>k.name===r.name&&Math.abs(k.result_x-r.x)<.0005&&Math.abs(k.result_y-r.y)<.0005)){skipped++;continue}p.known_points.push({id:uid(),project_id:pid,name:r.name,result_x:r.x,result_y:r.y,result_h:r.z});added++}}touch(p);store();return response({ok:1,added,skipped})}
 else return response({ok:0,error:'未対応の操作 '+action},404);
 store();return response({ok:1})}
 if(method==='DELETE'){
 if(action==='gpx'){p.gpx_files=p.gpx_files.filter(f=>f.id!==id);p.observations=p.observations.filter(o=>o.gpx_file_id!==id);regroup(p)}
 else if(action==='known'){p.known_points=p.known_points.filter(k=>k.id!==id);delete p.known_links[id]}
 else if(action==='new-point'){p.new_points=p.new_points.filter(n=>n.id!==id);p.distance_checks=p.distance_checks.filter(d=>d.from_point_id!==id&&d.to_point_id!==id)}
 else return response({ok:0,error:'未対応の削除'},404);
 touch(p);store();return response({ok:1})}
 return response({ok:0,error:'Unknown API'},404)
 }catch(e){console.error(e);return response({ok:0,error:String(e.message||e)},400)}}
const originalFetch=window.fetch.bind(window);window.fetch=(u,o)=>handle(u,o);
window.GNSSStore={backup(){const blob=new Blob([JSON.stringify({format:'gnss-v19-static',version:1,data:db},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='gnss_backup_'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)},async restore(f){const obj=JSON.parse(await f.text());if(obj.format!=='gnss-v19-static'||!obj.data?.projects||!obj.data?.settings)throw Error('対応するバックアップJSONではありません');db=obj.data;store();location.reload()},sima(pid){const content=simaOutput(pid);const blob=new Blob([content],{type:'text/plain;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=new Date().toISOString().slice(0,10).replace(/-/g,'')+'.sim';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}};
})();