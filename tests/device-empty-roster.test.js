const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const schoolDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date());
const DEMO_NAMES=['李明','王芳','张伟','刘洋','陈晨','赵强'];

async function startServer(extraEnv={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'classroom-empty-roster-'));
  const port=49000+Math.floor(Math.random()*10000);
  const base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,...extraEnv,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir},stdio:'ignore'});
  for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok)break}catch{}await wait(25)}
  async function req(url,method='GET',body,cookie='',token=''){
    const response=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  return {dir,base,child,req};
}
function stop(child,dir){if(child&&!child.killed)child.kill();fs.rmSync(dir,{recursive:true,force:true})}
function namesOf(students){return (students||[]).map(s=>s.name)}
function hasDemo(students){return namesOf(students).some(name=>DEMO_NAMES.includes(name))||(students||[]).some(s=>String(s.id).startsWith('demo-'))}

test('无匹配课次时座位为空，不返回全校名单或演示学生',async()=>{
  const {dir,child,req}=await startServer();
  try{
    const admin=(await req('/api/setup','POST',{username:'admin',name:'管理员',password:'AdminTest123!'})).cookie;
    let preview=await req('/api/admin/import/preview','POST',{kind:'students',rows:[{number:'A001',name:'甲同学',class:'一班'},{number:'B001',name:'乙同学',class:'二班'}]},admin);
    assert.equal((await req('/api/admin/import/commit','POST',{token:preview.data.token},admin)).status,200);
    preview=await req('/api/admin/import/preview','POST',{kind:'seats',rows:[{number:'A001',class:'一班',room:'信息房1',row:1,col:1},{number:'B001',class:'二班',room:'信息房2',row:1,col:1}]},admin);
    assert.equal((await req('/api/admin/import/commit','POST',{token:preview.data.token},admin)).status,200);
    const roster=(await req('/api/state','GET',undefined,admin)).data;
    const realStudent=roster.students.find(s=>s.number==='A001');
    const device=await req('/api/admin/devices','POST',{name:'电脑1',roomId:'room-1'},admin);
    const state=await req('/api/device/state','GET',undefined,'',device.data.token);
    assert.equal(state.status,200);
    assert.equal(state.data.currentLesson,null);
    assert.deepEqual(state.data.students,[]);
    assert.equal(hasDemo(state.data.students),false);
    const record=await req('/api/records','POST',{id:'no-lesson-record',studentId:realStudent.id,transcript:'不应写入',recordedAt:new Date().toISOString()},'',device.data.token);
    assert.equal(record.status,400);
    assert.match(record.data.error,/没有匹配课次/);
    const leftover=await req('/api/state','GET',undefined,admin);
    assert.equal(leftover.data.students.some(s=>String(s.id).startsWith('demo-')||DEMO_NAMES.includes(s.name)),false);
    assert.equal((await req('/api/records','GET',undefined,admin)).data.length,0);
  }finally{stop(child,dir)}
});

test('座位未导全时只显示当前课次真实学生，不编造人员',async()=>{
  const {dir,child,req}=await startServer();
  try{
    const admin=(await req('/api/setup','POST',{username:'admin',name:'管理员',password:'AdminTest123!'})).cookie;
    assert.equal((await req('/api/admin/periods','PUT',{periods:[{number:1,start:'00:00',end:'23:59'}]},admin)).status,200);
    let preview=await req('/api/admin/import/preview','POST',{kind:'students',rows:[{number:'A001',name:'甲同学',class:'一班'},{number:'A002',name:'丙同学',class:'一班'},{number:'B001',name:'乙同学',class:'二班'}]},admin);
    assert.equal((await req('/api/admin/import/commit','POST',{token:preview.data.token},admin)).status,200);
    preview=await req('/api/admin/import/preview','POST',{kind:'seats',rows:[{number:'A001',class:'一班',room:'信息房1',row:1,col:1}]},admin);
    assert.equal((await req('/api/admin/import/commit','POST',{token:preview.data.token},admin)).status,200);
    preview=await req('/api/admin/import/preview','POST',{kind:'schedule',rows:[{room:'信息房1',class:'一班',teacher:'王老师',subject:'信息科技',date:schoolDate(),period:1,weeks:'all'}]},admin);
    assert.equal((await req('/api/admin/import/commit','POST',{token:preview.data.token},admin)).status,200);
    const device=await req('/api/admin/devices','POST',{name:'电脑1',roomId:'room-1'},admin);
    const state=await req('/api/device/state','GET',undefined,'',device.data.token);
    assert.equal(state.status,200);
    assert.equal(state.data.currentLesson.subject,'信息科技');
    assert.deepEqual(namesOf(state.data.students).sort(),['丙同学','甲同学']);
    assert.equal(hasDemo(state.data.students),false);
    assert.equal(namesOf(state.data.students).includes('乙同学'),false);
  }finally{stop(child,dir)}
});

test('演示身份不会被静默写入真实学生表或课堂记录',async()=>{
  const {dir,child,req}=await startServer();
  try{
    const admin=(await req('/api/setup','POST',{username:'admin',name:'管理员',password:'AdminTest123!'})).cookie;
    const device=await req('/api/admin/devices','POST',{name:'电脑1',roomId:'room-1'},admin);
    const created=await req('/api/records','POST',{id:'demo-write-record',studentId:'demo-1',transcript:'示例记录',recordedAt:new Date().toISOString()},'',device.data.token);
    assert.notEqual(created.status,201);
    assert.equal(created.data.error,'学生不存在');
    const leftover=await req('/api/state','GET',undefined,admin);
    assert.equal(leftover.data.students.length,0);
    assert.equal((await req('/api/records','GET',undefined,admin)).data.length,0);
  }finally{stop(child,dir)}
});

test('ALLOW_DEMO_ROSTER 仅展示示例座位，录音仍拒绝写入演示身份',async()=>{
  const {dir,child,req}=await startServer({ALLOW_DEMO_ROSTER:'1'});
  try{
    const admin=(await req('/api/setup','POST',{username:'admin',name:'管理员',password:'AdminTest123!'})).cookie;
    const device=await req('/api/admin/devices','POST',{name:'电脑1',roomId:'room-1'},admin);
    const state=await req('/api/device/state','GET',undefined,'',device.data.token);
    assert.equal(state.status,200);
    assert.equal(hasDemo(state.data.students),true);
    const created=await req('/api/records','POST',{id:'opt-in-demo-record',studentId:state.data.students[0].id,transcript:'示例记录',recordedAt:new Date().toISOString()},'',device.data.token);
    assert.notEqual(created.status,201);
    const leftover=await req('/api/state','GET',undefined,admin);
    assert.equal(leftover.data.students.length,0);
    assert.equal((await req('/api/records','GET',undefined,admin)).data.length,0);
  }finally{stop(child,dir)}
});
