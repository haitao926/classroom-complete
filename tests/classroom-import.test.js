const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {conflictErrors,hasExistingConflicts,CONFLICT_MESSAGE}=require('../lib/classroom-import');

const periods=[{number:1,start:'08:00',end:'08:40'},{number:2,start:'08:50',end:'09:30'}];
const wait=ms=>new Promise(r=>setTimeout(r,ms));

function row(overrides={}){
  return {roomName:'信息房1',class:'一班',teacher:'王老师',subject:'信息科技',day:1,period:1,date:'',weeks:'all',start:'08:00',end:'08:40',_line:2,...overrides};
}

test('教室课次总表与现有课表冲突时给出可行动错误',()=>{
  const incoming=row({class:'二班',teacher:'李老师',_line:3});
  const existing=[row()];
  const errors=conflictErrors([incoming],existing,periods);
  assert.equal(errors.length,1);
  assert.equal(errors[0].line,3);
  assert.equal(errors[0].message,CONFLICT_MESSAGE);
  assert.equal(hasExistingConflicts([incoming],existing,periods),true);
});

test('同一课次多行学生或重复导入同一课次不算冲突',()=>{
  const a=row({_line:2});
  const b=row({_line:3,number:'2026002'});
  assert.deepEqual(conflictErrors([a,b],[],periods),[]);
  assert.equal(hasExistingConflicts([a],[row()],periods),false);
});

test('按年级分批导入时全部周与单周占用同一教室节次应冲突',()=>{
  const existing=[row({weeks:'all'})];
  const incoming=row({class:'八年级(1)班',teacher:'李老师',weeks:'odd',_line:4});
  const errors=conflictErrors([incoming],existing,periods);
  assert.equal(errors.length,1);
  assert.equal(errors[0].message,CONFLICT_MESSAGE);
});

test('不同教室或不同节次的教室课次总表可以并存',()=>{
  const existing=[row()];
  assert.deepEqual(conflictErrors([row({roomName:'信息房2',class:'二班'})],existing,periods),[]);
  assert.deepEqual(conflictErrors([row({period:2,start:'08:50',end:'09:30',class:'二班'})],existing,periods),[]);
});

test('教室课次总表导入冲突会被拒绝，成功导入仍可写入',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'classroom-import-conflict-'));
  const port=48000+Math.floor(Math.random()*1000);
  const base='http://127.0.0.1:'+port;
  let child;
  async function req(url,method='GET',body,cookie=''){
    const res=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};
  }
  async function imp(kind,rows,admin){
    const p=await req('/api/admin/import/preview','POST',{kind,rows},admin);
    assert.equal(p.status,200,JSON.stringify(p.data));
    assert.deepEqual(p.data.errors,[]);
    const c=await req('/api/admin/import/commit','POST',{token:p.data.token},admin);
    assert.equal(c.status,200,JSON.stringify(c.data));
    return c.data;
  }
  const classroom=overrides=>({roomId:'room-1',roomName:'信息房1',day:'周一',period:1,time:'08:00-08:40',weeks:'all',teacher:'王老师',subject:'信息科技',class:'一班',number:'2026001',name:'甲',row:1,col:1,...overrides});
  try{
    child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir},stdio:'ignore'});
    for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok)break}catch{}await wait(25)}
    const admin=(await req('/api/setup','POST',{username:'admin',name:'管理员',password:'AdminTest123!'})).cookie;

    await imp('classroom',[classroom(),classroom({number:'2026002',name:'乙',col:2})],admin);
    let state=(await req('/api/state','GET',undefined,admin)).data;
    assert.equal(state.schedule.filter(s=>s.room_id==='room-1'&&s.period===1).length,1);

    const clash=await req('/api/admin/import/preview','POST',{kind:'classroom',rows:[classroom({class:'二班',teacher:'李老师',number:'2026101',name:'丙'})]},admin);
    assert.equal(clash.status,200);
    assert.equal(clash.data.errors.length,1);
    assert.equal(clash.data.errors[0].message,'与现有课表或本次导入的课程时间冲突');
    assert.equal((await req('/api/admin/import/commit','POST',{token:clash.data.token},admin)).status,400);
    state=(await req('/api/state','GET',undefined,admin)).data;
    assert.equal(state.schedule.filter(s=>s.room_id==='room-1'&&s.period===1).length,1);
    assert.equal(state.schedule[0].teacher,'王老师');

    const again=await imp('classroom',[classroom(),classroom({number:'2026002',name:'乙',col:2})],admin);
    assert.equal(again.count,2);
    state=(await req('/api/state','GET',undefined,admin)).data;
    assert.equal(state.schedule.filter(s=>s.room_id==='room-1'&&s.period===1).length,1);

    await imp('classroom',[classroom({period:2,time:'08:50-09:30',class:'二班',teacher:'李老师',number:'2026101',name:'丙'})],admin);
    state=(await req('/api/state','GET',undefined,admin)).data;
    assert.equal(state.schedule.filter(s=>s.room_id==='room-1').length,2);
  }finally{
    if(child&&!child.killed)child.kill();
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

test('教室课次总表与已导入的课程安排冲突时同样阻止',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'classroom-vs-schedule-'));
  const port=49000+Math.floor(Math.random()*1000);
  const base='http://127.0.0.1:'+port;
  let child;
  async function req(url,method='GET',body,cookie=''){
    const res=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};
  }
  try{
    child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir},stdio:'ignore'});
    for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok)break}catch{}await wait(25)}
    const admin=(await req('/api/setup','POST',{username:'admin',name:'管理员',password:'AdminTest123!'})).cookie;
    let p=await req('/api/admin/import/preview','POST',{kind:'students',rows:[{number:'001',name:'甲',class:'一班'}]},admin);
    assert.equal((await req('/api/admin/import/commit','POST',{token:p.data.token},admin)).status,200);
    p=await req('/api/admin/import/preview','POST',{kind:'schedule',rows:[{room:'信息房1',class:'一班',teacher:'王老师',subject:'信息科技',day:'周一',period:1,weeks:'all'}]},admin);
    assert.equal(p.data.errors.length,0);
    assert.equal((await req('/api/admin/import/commit','POST',{token:p.data.token},admin)).status,200);

    const clash=await req('/api/admin/import/preview','POST',{kind:'classroom',rows:[{roomId:'room-1',roomName:'信息房1',day:'周一',period:1,weeks:'all',teacher:'李老师',subject:'信息科技',class:'二班',number:'2026101',name:'丙',row:1,col:1}]},admin);
    assert.equal(clash.data.errors.length,1);
    assert.equal(clash.data.errors[0].message,'与现有课表或本次导入的课程时间冲突');
    assert.equal((await req('/api/admin/import/commit','POST',{token:clash.data.token},admin)).status,400);
    const state=(await req('/api/state','GET',undefined,admin)).data;
    assert.equal(state.schedule.length,1);
    assert.equal(state.schedule[0].teacher,'王老师');
  }finally{
    if(child&&!child.killed)child.kill();
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
