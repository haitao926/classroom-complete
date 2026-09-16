const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const schoolDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date());
const addDays=(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);

test('设备临时调课后返回实际课次班级的完整学生名单',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'classroom-device-roster-'));
  const port=47000+Math.floor(Math.random()*1000);
  const base=`http://127.0.0.1:${port}`;
  let child;
  async function req(url,method='GET',body,cookie='',token=''){
    const response=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  try {
    child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir},stdio:'ignore'});
    for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok)break}catch{}await wait(25)}
    const admin=(await req('/api/setup','POST',{username:'admin',name:'管理员',password:'AdminTest123!'})).cookie;
    assert.equal((await req('/api/admin/periods','PUT',{periods:[{number:1,start:'00:00',end:'23:59'}]},admin)).status,200);
    let preview=await req('/api/admin/import/preview','POST',{kind:'students',rows:[{number:'A001',name:'甲同学',class:'原班'},{number:'B001',name:'乙同学',class:'调课班'}]},admin);
    assert.equal((await req('/api/admin/import/commit','POST',{token:preview.data.token},admin)).status,200);
    preview=await req('/api/admin/import/preview','POST',{kind:'seats',rows:[{number:'A001',class:'原班',room:'信息房1',row:1,col:1},{number:'B001',class:'调课班',room:'信息房1',row:2,col:1}]},admin);
    assert.equal((await req('/api/admin/import/commit','POST',{token:preview.data.token},admin)).status,200);
    const sourceDate=addDays(schoolDate(),2);
    preview=await req('/api/admin/import/preview','POST',{kind:'schedule',rows:[{room:'信息房1',class:'原班',teacher:'王老师',subject:'原课程',date:schoolDate(),period:1,weeks:'all'},{room:'信息房1',class:'调课班',teacher:'李老师',subject:'调课课程',date:sourceDate,period:1,weeks:'all'}]},admin);
    assert.equal((await req('/api/admin/import/commit','POST',{token:preview.data.token},admin)).status,200);
    const device=await req('/api/admin/devices','POST',{name:'电脑1',roomId:'room-1'},admin);
    const state=await req('/api/device/state','GET',undefined,'',device.data.token);
    assert.equal(state.status,200);
    assert.equal(state.data.currentLesson.subject,'原课程');
    assert.deepEqual(state.data.students.map(student=>student.name),['甲同学']);
    const options=await req(`/api/device/adjustments/options?sourceDate=${sourceDate}&sourcePeriod=1`,'GET',undefined,'',device.data.token);
    assert.equal(options.data.options.length,1);
    const target=options.data.options.find(option=>option.class_name==='调课班');
    assert.ok(target);
    const adjustment=await req('/api/device/adjustments','POST',{date:schoolDate(),period:1,sourceDate,sourcePeriod:1,scheduleId:target.id},'',device.data.token);
    assert.equal(adjustment.status,201);
    assert.deepEqual(adjustment.data.students.map(student=>student.name),['乙同学']);
    const adjusted=await req('/api/device/state','GET',undefined,'',device.data.token);
    assert.equal(adjusted.data.currentLesson.class_id,target.class_id);
    assert.deepEqual(adjusted.data.students.map(student=>student.name),['乙同学']);
    const record=await req('/api/records','POST',{id:'temporary-class-record',studentId:adjusted.data.students[0].id,transcript:'临时调课课堂记录',recordedAt:new Date().toISOString()},'',device.data.token);
    assert.equal(record.status,201);
  } finally {
    if(child&&!child.killed)child.kill();
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

test('调课选项只加载老师指定日期和节次的课程内容',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'classroom-adjustment-options-'));
  const port=48000+Math.floor(Math.random()*1000);
  const base=`http://127.0.0.1:${port}`;
  let child;
  async function req(url,method='GET',body,cookie='',token=''){
    const response=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  try {
    child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir},stdio:'ignore'});
    for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok)break}catch{}await wait(25)}
    const admin=(await req('/api/setup','POST',{username:'admin',name:'管理员',password:'AdminTest123!'})).cookie;
    await req('/api/admin/periods','PUT',{periods:[{number:1,start:'08:00',end:'08:40'},{number:2,start:'09:00',end:'09:40'}]},admin);
    let preview=await req('/api/admin/import/preview','POST',{kind:'students',rows:[{number:'001',name:'甲',class:'一班'},{number:'002',name:'乙',class:'二班'}]},admin);
    await req('/api/admin/import/commit','POST',{token:preview.data.token},admin);
    const monday='2026-09-07';
    preview=await req('/api/admin/import/preview','POST',{kind:'schedule',rows:[{room:'信息房1',class:'一班',teacher:'王老师',subject:'第一节内容',date:monday,period:1,weeks:'all'},{room:'信息房1',class:'二班',teacher:'李老师',subject:'第二节内容',date:monday,period:2,weeks:'all'}]},admin);
    await req('/api/admin/import/commit','POST',{token:preview.data.token},admin);
    const device=await req('/api/admin/devices','POST',{name:'电脑1',roomId:'room-1'},admin);
    const first=await req(`/api/device/adjustments/options?sourceDate=${monday}&sourcePeriod=1`,'GET',undefined,'',device.data.token);
    const second=await req(`/api/device/adjustments/options?sourceDate=${monday}&sourcePeriod=2`,'GET',undefined,'',device.data.token);
    assert.deepEqual(first.data.options.map(x=>x.subject),['第一节内容']);
    assert.deepEqual(second.data.options.map(x=>x.subject),['第二节内容']);
  } finally {
    if(child&&!child.killed)child.kill();
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

const DEMO_NAMES=['李明','王芳','张伟','刘洋','陈晨','赵强'];
function assertNoFabricatedRoster(students){
  assert.ok(Array.isArray(students));
  assert.ok(!students.some(s=>String(s.id).startsWith('demo-')||String(s.number||'').startsWith('DEMO-')||DEMO_NAMES.includes(s.name)));
}

test('服务端生产路径不含全校摊开或虚构demo学生回退',()=>{
  const server=fs.readFileSync(require.resolve('../server.js'),'utf8');
  assert.doesNotMatch(server,/demoNames/);
  assert.doesNotMatch(server,/李明/);
  assert.doesNotMatch(server,/王芳/);
  assert.doesNotMatch(server,/七年级\(1\)班/);
  assert.doesNotMatch(server,/allStudents\.map\(\(s,idx\)/);
  assert.doesNotMatch(server,/INSERT OR IGNORE INTO students[\s\S]*DEMO-/);
  assert.match(server,/students=lessonRoster\(room\.id,resolved\.lesson,allStudents\)/);
  assert.match(server,/String\(b\.studentId\)\.startsWith\('demo-'\)/);
});

test('无课次、无座位或课次班级无座位时座位表为空，且拒绝写入虚构学生',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'classroom-empty-roster-'));
  const port=49000+Math.floor(Math.random()*1000);
  const base=`http://127.0.0.1:${port}`;
  let child;
  async function req(url,method='GET',body,cookie='',token='',headers={}){
    const response=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...headers,...(cookie?{Cookie:cookie}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  try {
    child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir},stdio:'ignore'});
    for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok)break}catch{}await wait(25)}
    const admin=(await req('/api/setup','POST',{username:'admin',name:'管理员',password:'AdminTest123!'})).cookie;
    const emptySchool=await req('/api/device/state','GET',undefined,'','',{'X-Classroom-Room':'room-1'});
    assert.equal(emptySchool.status,200);
    assert.equal(emptySchool.data.currentLesson,null);
    assert.deepEqual(emptySchool.data.students,[]);
    assertNoFabricatedRoster(emptySchool.data.students);
    assert.ok(!emptySchool.data.classes.some(c=>c.name==='七年级(1)班'));

    assert.equal((await req('/api/admin/periods','PUT',{periods:[{number:1,start:'00:00',end:'23:59'}]},admin)).status,200);
    let preview=await req('/api/admin/import/preview','POST',{kind:'students',rows:[{number:'A001',name:'甲同学',class:'一班'},{number:'B001',name:'乙同学',class:'二班'},{number:'C001',name:'丙同学',class:'三班'}]},admin);
    assert.equal((await req('/api/admin/import/commit','POST',{token:preview.data.token},admin)).status,200);
    const imported=(await req('/api/state','GET',undefined,admin)).data;
    assert.equal(imported.students.length,3);

    const device=await req('/api/admin/devices','POST',{name:'电脑1',roomId:'room-1'},admin);
    const noSchedule=await req('/api/device/state','GET',undefined,'',device.data.token);
    assert.equal(noSchedule.status,200);
    assert.equal(noSchedule.data.currentLesson,null);
    assert.deepEqual(noSchedule.data.students,[]);
    assertNoFabricatedRoster(noSchedule.data.students);

    preview=await req('/api/admin/import/preview','POST',{kind:'seats',rows:[{number:'A001',class:'一班',room:'信息房1',row:1,col:1},{number:'B001',class:'二班',room:'信息房1',row:1,col:2}]},admin);
    assert.equal((await req('/api/admin/import/commit','POST',{token:preview.data.token},admin)).status,200);
    const seatsButNoLesson=await req('/api/device/state','GET',undefined,'',device.data.token);
    assert.equal(seatsButNoLesson.data.currentLesson,null);
    assert.deepEqual(seatsButNoLesson.data.students,[]);
    assertNoFabricatedRoster(seatsButNoLesson.data.students);

    const otherDay=addDays(schoolDate(),3);
    preview=await req('/api/admin/import/preview','POST',{kind:'schedule',rows:[{room:'信息房1',class:'三班',teacher:'周老师',subject:'无座位课程',date:schoolDate(),period:1,weeks:'all'},{room:'信息房1',class:'一班',teacher:'王老师',subject:'有座位课程',date:otherDay,period:1,weeks:'all'}]},admin);
    assert.equal((await req('/api/admin/import/commit','POST',{token:preview.data.token},admin)).status,200);
    const lessonWithoutSeats=await req('/api/device/state','GET',undefined,'',device.data.token);
    assert.equal(lessonWithoutSeats.data.currentLesson.subject,'无座位课程');
    assert.deepEqual(lessonWithoutSeats.data.students,[]);
    assertNoFabricatedRoster(lessonWithoutSeats.data.students);
    assert.ok(!lessonWithoutSeats.data.students.some(s=>['甲同学','乙同学','丙同学'].includes(s.name)));

    preview=await req('/api/admin/import/preview','POST',{kind:'seats',rows:[{number:'C001',class:'三班',room:'信息房1',row:3,col:3}]},admin);
    assert.equal((await req('/api/admin/import/commit','POST',{token:preview.data.token},admin)).status,200);
    const lessonWithSeats=await req('/api/device/state','GET',undefined,'',device.data.token);
    assert.equal(lessonWithSeats.data.currentLesson.subject,'无座位课程');
    assert.deepEqual(lessonWithSeats.data.students.map(s=>s.name),['丙同学']);
    assert.equal(lessonWithSeats.data.students[0].row,3);
    assert.equal(lessonWithSeats.data.students[0].col,3);
    assertNoFabricatedRoster(lessonWithSeats.data.students);

    const lan=await req('/api/device/state','GET',undefined,'','',{'X-Classroom-Room':'room-1'});
    assert.deepEqual(lan.data.students.map(s=>s.name),['丙同学']);

    const demoRecord=await req('/api/records','POST',{id:'demo-should-not-write',studentId:'demo-1',transcript:'不应写入真实库'},'',device.data.token);
    assert.equal(demoRecord.status,400);
    assert.match(String(demoRecord.data.error||''),/学生不存在/);
    const after=(await req('/api/state','GET',undefined,admin)).data;
    assert.equal(after.students.length,3);
    assert.ok(!after.students.some(s=>String(s.id).startsWith('demo-')||String(s.number||'').startsWith('DEMO-')||DEMO_NAMES.includes(s.name)));
    assert.equal((await req('/api/records','GET',undefined,admin)).data.length,0);

    const realRecord=await req('/api/records','POST',{id:'real-seated-record',studentId:lessonWithSeats.data.students[0].id,transcript:'匹配课次与座位后的课堂记录'},'',device.data.token);
    assert.equal(realRecord.status,201);
  } finally {
    if(child&&!child.killed)child.kill();
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
