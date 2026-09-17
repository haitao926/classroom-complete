const {test}=require('node:test');
const assert=require('node:assert/strict');
const {selectPeriod,overlaps}=require('../lib/schedule-time');

const periods=[
  {number:1,start:'08:00',end:'08:40'},
  {number:2,start:'08:50',end:'09:30'},
  {number:3,start:'09:50',end:'10:30'}
];

test('课间默认选择下一节课',()=>{
  assert.equal(selectPeriod('08:45',periods),2);
});

test('最后一节课结束后不虚构课程',()=>{
  assert.equal(selectPeriod('11:00',periods),null);
});

test('同一教室同一节次视为课表冲突，不同教室不冲突',()=>{
  const a={room:'信息房1',day:1,period:1,weeks:'all',date:'',start:'08:00',end:'08:40'};
  const b={...a,class:'二班',teacher:'李老师'};
  assert.equal(overlaps(a,b),true);
  assert.equal(overlaps(a,{...b,room:'信息房2'}),false);
  assert.equal(overlaps(a,{...b,period:2,start:'08:50',end:'09:30'}),false);
});

test('全部周与单周、具体日期与星期重叠时仍冲突',()=>{
  const weekly={room:'信息房1',day:1,period:1,weeks:'all',date:'',start:'08:00',end:'08:40'};
  assert.equal(overlaps(weekly,{...weekly,weeks:'odd'}),true);
  assert.equal(overlaps(weekly,{...weekly,date:'2026-09-07'}),true);
  assert.equal(overlaps(weekly,{...weekly,date:'2026-09-08'}),false);
});
