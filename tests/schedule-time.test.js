const {test}=require('node:test');
const assert=require('node:assert/strict');
const {selectPeriod}=require('../lib/schedule-time');

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
