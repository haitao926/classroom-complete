const {test}=require('node:test');
const assert=require('node:assert/strict');
const {uploadServer,flushPending}=require('../desktop/queue');

test('旧 localhost 记录保留原地址，避免错误写入学校数据',()=>{
  assert.equal(uploadServer('http://localhost:3000','http://10.15.46.72:8020/'),'http://localhost:3000');
  assert.equal(uploadServer('http://other:3000','http://10.15.46.72:8020/'),'http://other:3000');
  assert.equal(uploadServer('', 'http://10.15.46.72:8020/'),'http://10.15.46.72:8020/');
});

test('单条上传失败不会阻塞后续记录',async()=>{
  const items=[{record:{id:'one'}},{record:{id:'two'}},{record:{id:'three'}}];
  const attempted=[];
  const remaining=await flushPending(items,async item=>{
    attempted.push(item.record.id);
    if(item.record.id==='one')throw Error('学生不存在');
  },123);
  assert.deepEqual(attempted,['one','two','three']);
  assert.equal(remaining.length,1);
  assert.equal(remaining[0].record.id,'one');
  assert.equal(remaining[0].lastError,'学生不存在');
  assert.equal(remaining[0].lastAttemptAt,123);
});
