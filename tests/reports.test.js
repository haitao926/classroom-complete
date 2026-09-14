const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const wait=ms=>new Promise(r=>setTimeout(r,ms));

test('评价报表使用真实姓名、口语转写和学生历史观察生成汇总',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'classroom-reports-')),port=37000+Math.floor(Math.random()*10000),base='http://127.0.0.1:'+port;let child,provider,logs='',llmCalls=0,secondPrompt='';
 async function launch(){child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir},stdio:['ignore','pipe','pipe']});child.stderr.on('data',b=>logs+=b);for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok)return}catch{}await wait(30)}throw Error('启动失败 '+logs)}
 async function req(url,method='GET',body,cookie=''){const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}}
 async function until(fn){for(let i=0;i<80;i++){const v=await fn();if(v)return v;await wait(120)}throw Error('任务超时 '+logs)}
 async function imp(kind,rows,cookie){const p=await req('/api/admin/import/preview','POST',{kind,rows},cookie);assert.equal(p.status,200);assert.deepEqual(p.data.errors,[]);const c=await req('/api/admin/import/commit','POST',{token:p.data.token},cookie);assert.equal(c.status,200);return c.data}
 try{
  provider=http.createServer(async(req,res)=>{const chunks=[];for await(const p of req)chunks.push(p);const body=JSON.parse(Buffer.concat(chunks));const system=body.messages[0].content,user=body.messages[1].content;llmCalls++;if(llmCalls===2){secondPrompt=system;assert.match(system,/真实学生姓名：张志杰/);assert.match(system,/此前已确认的课堂观察/);assert.match(system,/帮助同伴排查循环条件/)}const evidence=llmCalls===1?'主动帮助同伴排查循环条件':'经提醒后重新检查变量命名';res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({summary:llmCalls===1?'帮助同伴排查问题':'重新检查变量命名',evaluation:llmCalls===1?'张志杰本节课主动帮助同伴排查循环条件，能把问题定位到判断语句。':'张志杰本节课在教师提醒后重新检查变量命名，能够根据反馈修正调试方向；结合此前帮助同伴排查循环条件的记录，可以看到他在问题定位上有连续表现。',facts:[evidence],scores:[{dimension:'问题解决',score:2,evidence,reason:'能根据提示或反馈完成问题定位'}]})}}]}))});
  await new Promise(r=>provider.listen(0,'127.0.0.1',r));await launch();
  const admin=(await req('/api/setup','POST',{username:'admin',name:'管理员',password:'AdminTest123!'})).cookie;
  await imp('students',[{number:'001',name:'张志杰',class:'一班'}],admin);
  const state=(await req('/api/state','GET',undefined,admin)).data,student=state.students[0],classId=state.classes[0].id;
  await req('/api/admin/providers','PUT',{llm:{url:'http://127.0.0.1:'+provider.address().port+'/llm',model:'test-llm',key:'test-key'}},admin);
  await req('/api/admin/users','POST',{name:'一班班主任',username:'head',password:'TeacherPass123',role:'headteacher',classes:[classId]},admin);
  const head=(await req('/api/login','POST',{username:'head',password:'TeacherPass123'})).cookie;
  const first=await req('/api/records','POST',{id:'report-record-001',studentId:student.id,transcript:'主动帮助同伴排查循环条件',recordedAt:'2026-09-08T02:00:00.000Z'},head);
  assert.equal(first.status,201);
  const firstReview=await until(async()=>{const r=await req('/api/records/report-record-001','GET',undefined,head);return r.data.status==='review'?r.data:null});
  assert.match(firstReview.analysis.evaluation,/张志杰/);
  assert.equal((await req('/api/records/report-record-001/review','POST',{version:firstReview.version,scores:[{dimension:'问题解决',score:2,reason:'已核对课堂记录'}]},head)).status,200);
  const second=await req('/api/records','POST',{id:'report-record-002',studentId:student.id,transcript:'录音里可能听成张子杰，经提醒后重新检查变量命名',recordedAt:'2026-09-09T02:00:00.000Z'},head);
  assert.equal(second.status,201);
  const secondReview=await until(async()=>{const r=await req('/api/records/report-record-002','GET',undefined,head);return r.data.status==='review'?r.data:null});
  assert.match(secondReview.analysis.evaluation,/^张志杰/);assert.match(secondPrompt,/张志杰/);
  const lesson=await req('/api/reports?type=lesson&date=2026-09-09&class='+classId,'GET',undefined,head);
  assert.equal(lesson.status,200);assert.match(lesson.data.groups[0].students[0].evaluation,/张志杰本节课/);
  const week=await req('/api/reports?type=week&date=2026-09-09&class='+classId,'GET',undefined,head);
  assert.equal(week.status,200);assert.equal(week.data.students[0].record_count,2);assert.match(week.data.students[0].evaluations[1].evaluation,/帮助同伴排查循环条件/);
 }finally{if(child&&!child.killed)await new Promise(resolve=>{child.once('exit',resolve);child.kill()});if(provider)await new Promise(r=>provider.close(r));fs.rmSync(dir,{recursive:true,force:true})}
});
