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
    preview=await req('/api/admin/import/preview','POST',{kind:'seats',rows:[{number:'A001',class:'原班',room:'信息房1',row:1,col:1}]},admin);
    assert.equal((await req('/api/admin/import/commit','POST',{token:preview.data.token},admin)).status,200);
    const sourceDate=addDays(schoolDate(),2);
    preview=await req('/api/admin/import/preview','POST',{kind:'schedule',rows:[{room:'信息房1',class:'原班',teacher:'王老师',subject:'原课程',date:schoolDate(),period:1,weeks:'all'},{room:'信息房1',class:'调课班',teacher:'李老师',subject:'调课课程',date:sourceDate,period:1,weeks:'all'}]},admin);
    assert.equal((await req('/api/admin/import/commit','POST',{token:preview.data.token},admin)).status,200);
    const device=await req('/api/admin/devices','POST',{name:'电脑1',roomId:'room-1'},admin);
    const state=await req('/api/device/state','GET',undefined,'',device.data.token);
    assert.equal(state.status,200);
    assert.equal(state.data.currentLesson.subject,'原课程');
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
