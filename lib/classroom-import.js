const dayMap={
  '周一':1,'星期一':1,'周二':2,'星期二':2,'周三':3,'星期三':3,
  '周四':4,'星期四':4,'周五':5,'星期五':5,'周六':6,'星期六':6,
  '周日':0,'星期日':0
};

function normalizeClassroom(row,{periods,clean,fail}){
  const r=Object.fromEntries(Object.entries(row).map(([k,v])=>[k,clean(v)]));
  if(!r.roomId||!r.roomName||!r.class||!r.number||!r.name||!r.teacher||!r.subject)fail('教室ID、教室名称、班级、学号、姓名、教师、课程必填');
  if(/\s/.test(r.roomId)||r.roomId.length>80)fail('教室ID不能包含空格且不超过80字符');
  r.row=+r.row;r.col=+r.col;
  if(!Number.isInteger(r.row)||!Number.isInteger(r.col)||r.row<1||r.row>6||r.col<1||r.col>6)fail('座位行列必须为1—6');
  if(!r.day&&!r.date)fail('请提供星期或具体日期');
  r.day=dayMap[r.day]??Number(r.day);
  if(r.date&&/^\d{5}$/.test(r.date))r.date=new Date((+r.date-25569)*86400000).toISOString().slice(0,10);
  if(r.date&&!/^\d{4}-\d{2}-\d{2}$/.test(r.date))fail('日期应为YYYY-MM-DD');
  if(!r.date&&(!Number.isInteger(r.day)||r.day<0||r.day>6))fail('请填写星期0—6或具体日期');
  r.period=Number(String(r.period||'').replace(/[^0-9]/g,''));
  if(!Number.isInteger(r.period)||!periods.some(p=>p.number===r.period))fail('节次必须为已配置的有效节次');
  if(r.time){
    const match=r.time.match(/^\s*((?:[01]?\d|2[0-3]):[0-5]\d)\s*[-~至]\s*((?:[01]?\d|2[0-3]):[0-5]\d)\s*$/);
    if(!match)fail('时间应为HH:MM-HH:MM格式');
    r.start=match[1].length===4?'0'+match[1]:match[1];
    r.end=match[2].length===4?'0'+match[2]:match[2];
    if(r.start>=r.end)fail('时间结束必须晚于开始');
  }
  r.weeks=({'单周':'odd','双周':'even','全部':'all'}[r.weeks]||r.weeks||'all');
  if(!['all','odd','even'].includes(r.weeks))fail('周次填all、odd或even');
  return r;
}

function applyClassroom(rows,{D,fail,periods}){
  let count=0;const touched=new Set();
  for(const r of rows){
    let room=D.one('SELECT * FROM rooms WHERE id=?',r.roomId);
    if(room&&room.name!==r.roomName)fail(`教室ID ${r.roomId} 已绑定为“${room.name}”，不能改名`);
    if(!room){D.run('INSERT INTO rooms(id,name) VALUES (?,?)',r.roomId,r.roomName);room=D.one('SELECT * FROM rooms WHERE id=?',r.roomId)}
    const classRow=D.one('SELECT id FROM classes WHERE name=?',r.class)||(()=>{const id=D.id();D.run('INSERT INTO classes(id,name) VALUES (?,?)',id,r.class);return {id}})();
    let student=D.one('SELECT * FROM students WHERE number=?',r.number);
    if(student)D.run('UPDATE students SET name=?,class_id=? WHERE id=?',r.name,classRow.id,student.id);else{student={id:D.id()};D.run('INSERT INTO students(id,number,name,class_id) VALUES (?,?,?,?)',student.id,r.number,r.name,classRow.id)}
    const scheduleKey=[r.roomId,classRow.id,r.teacher,r.subject,r.day,r.period,r.date||'',r.weeks].join('|');
    if(!touched.has(scheduleKey)){D.run('DELETE FROM schedule WHERE room_id=? AND class_id=? AND teacher=? AND subject=? AND day=? AND period=? AND date=? AND weeks=?',r.roomId,classRow.id,r.teacher,r.subject,r.day,r.period,r.date||'',r.weeks);const p=periods.find(x=>x.number===r.period);const start=r.start||p.start,end=r.end||p.end;D.run('INSERT INTO schedule(id,room_id,class_id,teacher,subject,day,start,end,date,weeks,period) VALUES (?,?,?,?,?,?,?,?,?,?,?)',D.id(),r.roomId,classRow.id,r.teacher,r.subject,r.day,start,end,r.date||'',r.weeks,r.period);touched.add(scheduleKey)}
    D.run('DELETE FROM seats WHERE room_id=? AND class_id=? AND (student_id=? OR (row=? AND col=?))',r.roomId,classRow.id,student.id,r.row,r.col);
    D.run('INSERT INTO seats(room_id,class_id,row,col,student_id) VALUES (?,?,?,?,?)',r.roomId,classRow.id,r.row,r.col,student.id);count++;
  }
  return count;
}

module.exports={normalizeClassroom,applyClassroom};
