const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');

const wait=ms=>new Promise(r=>setTimeout(r,ms));

test('教师端可以调整授权班级座位并临时更换教室，管理员端独立可见',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'classroom-position-'));const port=41000+Math.floor(Math.random()*8000),base='http://127.0.0.1:'+port;let child;
 async function req(url,method='GET',body,cookie=''){const res=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});const raw=await res.text();let data;try{data=JSON.parse(raw)}catch{data=raw}return {status:res.status,data,cookie:res.headers.get('set-cookie')?.split(';')[0]}}
 async function launch(){child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir},stdio:['ignore','pipe','pipe']});for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok)return}catch{}await wait(30)}throw Error('启动失败')}
 async function imp(kind,rows,admin){const p=await req('/api/admin/import/preview','POST',{kind,rows},admin);assert.equal(p.status,200);assert.deepEqual(p.data.errors,[]);const c=await req('/api/admin/import/commit','POST',{token:p.data.token},admin);assert.equal(c.status,200)}
 try{
  await launch();const setup=await req('/api/setup','POST',{username:'admin',name:'管理员',password:'AdminTest123!'});const admin=setup.cookie;
  await imp('students',[{number:'001',name:'甲',class:'一班'},{number:'002',name:'乙',class:'一班'}],admin);
  await imp('seats',[{number:'001',class:'一班',room:'信息房1',row:1,col:1},{number:'002',class:'一班',room:'信息房1',row:1,col:2}],admin);
  await imp('schedule',[{room:'信息房1',class:'一班',teacher:'王老师',subject:'信息科技',day:1,start:'08:00',end:'08:40',weeks:'all'}],admin);
  const state=(await req('/api/state','GET',undefined,admin)).data,cid=state.classes[0].id,s1=state.students.find(s=>s.number==='001').id;
  const created=await req('/api/admin/users','POST',{name:'王老师',username:'teacher1',password:'TeacherPass123',role:'teacher',classes:[cid]},admin);assert.equal(created.status,201);
  const teacher=(await req('/api/login','POST',{username:'teacher1',password:'TeacherPass123'})).cookie;
  assert.equal((await req('/api/admin/users','GET',undefined,teacher)).status,403);
  assert.equal((await req('/teacher')).status,200);assert.equal((await req('/admin')).status,200);
  const swap=await req('/api/teacher/seat-swaps','POST',{classId:cid,roomId:'room-1',studentId:s1,from:{row:1,col:1},to:{row:2,col:3},reason:'便于合作'},teacher);
  assert.equal(swap.status,200,JSON.stringify(swap.data));assert.equal(swap.data.changes.length,1);assert.equal(swap.data.changes[0].to.row,2);
  const moves=await req('/api/teacher/classroom-moves','POST',{classId:cid,fromRoomId:'room-1',toRoomId:'room-2',date:'2026-09-07',period:1,reason:'设备故障'},teacher);
  assert.equal(moves.status,201,JSON.stringify(moves.data));
  assert.equal((await req('/api/teacher/classroom-moves','GET',undefined,teacher)).data.length,1);
  const adminMoves=await req('/api/admin/classroom-moves','GET',undefined,admin);assert.equal(adminMoves.status,200);assert.equal(adminMoves.data.length,1);assert.equal((await req('/api/admin/classroom-moves/'+moves.data.id+'/cancel','POST',{},admin)).status,200);
  assert.equal((await req('/api/teacher/seat-swaps','POST',{classId:'other',roomId:'room-1',studentId:s1,from:{row:2,col:3},to:{row:2,col:4}},teacher)).status,403);
  const snapshot=(await req('/api/teacher/state','GET',undefined,teacher)).data.seats;
  const seats=[{student_id:s1,row:6,col:6}];
  const save=body=>req('/api/teacher/seat-map','PUT',{classId:cid,roomId:'room-1',previous:snapshot,seats,...body},teacher);
  assert.equal((await save({classId:'other'})).status,403);
  assert.equal((await save({seats:[...seats,...seats]})).status,400);
  assert.equal((await save({seats:[{student_id:'unknown',row:1,col:1}]})).status,400);
  assert.equal((await save({seats:[{student_id:s1,row:7,col:1}]})).status,400);
  assert.equal((await save({})).status,200);
  assert.equal((await save({})).status,409);
  const after=(await req('/api/teacher/state','GET',undefined,teacher)).data;
  assert.equal(after.seats.length,1);assert.equal(after.seats[0].row,6);
  assert.ok(after.seatChanges.some(s=>s.to_row===null));
  const imported=await req('/api/teacher/seat-map/read','POST',{classId:cid,name:'seats.csv',data:Buffer.from('甲,,,,,\n,,,,,\n乙,,,,,').toString('base64')},teacher);
  assert.equal(imported.status,200);assert.equal(imported.data.sheets[0].rows.length,3);assert.equal(imported.data.sheets[0].rows[2][0],'乙');
  assert.equal((await req('/api/teacher/seat-map/read','POST',{classId:'other',name:'seats.csv',data:'YQ=='},teacher)).status,403);
 }finally{if(child)await new Promise(resolve=>{child.once('exit',resolve);child.kill()});fs.rmSync(dir,{recursive:true,force:true})}
});
