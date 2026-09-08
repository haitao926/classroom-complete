const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const wait=ms=>new Promise(r=>setTimeout(r,ms));

test('班主任可查看班级全部评语，任课教师只能查看自己课程',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'classroom-record-perm-')),port=43000+Math.floor(Math.random()*5000),base='http://127.0.0.1:'+port;let child;
 async function req(url,method='GET',body,cookie=''){const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});let data;try{data=await r.json()}catch{data=await r.text()}return {status:r.status,data,cookie:r.headers.get('set-cookie')?.split(';')[0]}}
 async function imp(kind,rows,cookie){const p=await req('/api/admin/import/preview','POST',{kind,rows},cookie);assert.equal(p.status,200);assert.deepEqual(p.data.errors,[]);const c=await req('/api/admin/import/commit','POST',{token:p.data.token},cookie);assert.equal(c.status,200)}
 try{
  child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir},stdio:['ignore','pipe','pipe']});for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok)break}catch{}await wait(25)}
  const admin=(await req('/api/setup','POST',{username:'admin',name:'管理员',password:'AdminTest123!'})).cookie;
  await imp('students',[{number:'001',name:'甲',class:'一班'}],admin);await imp('seats',[{number:'001',class:'一班',room:'信息房1',row:1,col:1}],admin);
  await imp('schedule',[{room:'信息房1',class:'一班',teacher:'王老师',subject:'信息科技',day:1,period:1,weeks:'all'},{room:'信息房1',class:'一班',teacher:'李老师',subject:'数学',day:1,period:2,weeks:'all'}],admin);
  const st=(await req('/api/state','GET',undefined,admin)).data,cid=st.classes[0].id,sid=st.students[0].id;
  for(const x of [{name:'王老师',username:'wang',role:'teacher'},{name:'李老师',username:'li',role:'teacher'},{name:'班主任',username:'head',role:'headteacher'}]){const c=await req('/api/admin/users','POST',{...x,password:'TeacherPass123',classes:[cid]},admin);assert.equal(c.status,201)}
  const one=await req('/api/records','POST',{id:'record-wang-001',studentId:sid,roomId:'room-1',transcript:'信息科技评语',recordedAt:'2026-09-07T00:10:00.000Z'},admin);assert.equal(one.status,201);
  const two=await req('/api/records','POST',{id:'record-li-001',studentId:sid,roomId:'room-1',transcript:'数学评语',recordedAt:'2026-09-07T01:00:00.000Z'},admin);assert.equal(two.status,201);
  const wang=(await req('/api/login','POST',{username:'wang',password:'TeacherPass123'})).cookie,li=(await req('/api/login','POST',{username:'li',password:'TeacherPass123'})).cookie,head=(await req('/api/login','POST',{username:'head',password:'TeacherPass123'})).cookie;
  assert.equal((await req('/api/records','GET',undefined,wang)).data.length,1);assert.equal((await req('/api/records','GET',undefined,wang)).data[0].teacher,'王老师');
  assert.equal((await req('/api/records','GET',undefined,li)).data.length,1);assert.equal((await req('/api/records','GET',undefined,li)).data[0].teacher,'李老师');
  assert.equal((await req('/api/records','GET',undefined,head)).data.length,2);
  assert.equal((await req('/api/records/record-li-001','GET',undefined,wang)).status,403);assert.equal((await req('/api/records/record-li-001/retry','POST',{},wang)).status,403);assert.equal((await req('/api/records/record-li-001/review','POST',{version:1,scores:[]},wang)).status,403);
  assert.equal((await req('/api/records/record-li-001','GET',undefined,head)).status,200);
 }finally{if(child)await new Promise(resolve=>{child.once('exit',resolve);child.kill()});fs.rmSync(dir,{recursive:true,force:true})}
});
