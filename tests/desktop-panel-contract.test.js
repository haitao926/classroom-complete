const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync(require.resolve('../desktop/panel.html'),'utf8');
const js=fs.readFileSync(require.resolve('../desktop/panel.js'),'utf8');
const orbHtml=fs.readFileSync(require.resolve('../desktop/orb.html'),'utf8');
const orbJs=fs.readFileSync(require.resolve('../desktop/orb.js'),'utf8');
const main=fs.readFileSync(require.resolve('../desktop/main.cjs'),'utf8');
const preload=fs.readFileSync(require.resolve('../desktop/preload.cjs'),'utf8');
const server=fs.readFileSync(require.resolve('../server.js'),'utf8');

test('桌面课堂端不提供班级下拉，课程由教室自动匹配',()=>{
  assert.doesNotMatch(html,/id="classes"/);
  assert.doesNotMatch(html,/id="config-class"/);
  assert.match(html,/id="adjust"[^>]*>临时调课</);
  assert.match(html,/id="settings"[\s\S]*id="adjust"[\s\S]*id="hide"/);
  assert.match(js,/currentLesson/);
});

test('桌面端教室设置不创建临时调课',()=>{
  assert.doesNotMatch(js,/save-config[^\n]*desktop\.call\('adjust'/);
});

test('关闭桌面面板不会退出悬浮球常驻进程',()=>{
  assert.match(main,/panel\.on\('close',[\s\S]*event\.preventDefault\(\)[\s\S]*panel\.hide\(\)/);
  assert.match(main,/app\.on\('window-all-closed',[\s\S]*event\.preventDefault\(\)/);
  assert.match(main,/app\.on\('before-quit',[\s\S]*quitting=true/);
});

test('悬浮球使用更小的圆形轮廓和清晰中心图标',()=>{
  assert.match(orbHtml,/width:42px;height:42px/);
  assert.match(orbHtml,/border-radius:50%/);
  assert.match(orbHtml,/<img src="assets\/icon\.png"/);
  assert.match(orbJs,/setAttribute\('aria-label'/);
});

test('调课课程请求兼容旧后台的日期和节次参数',()=>{
  assert.match(main,/searchParams\.set\('date',date\)/);
  assert.match(main,/searchParams\.set\('period',period\)/);
  assert.match(main,/sourceDate=.*sourcePeriod/);
});

test('临时调课只有在当前课堂真正切换后才提示已生效',()=>{
  assert.match(js,/saveAdjust[\s\S]*currentSource:'temporary'/);
  assert.match(html,/要上哪一天的内容/);
  assert.match(html,/那一天的第几节/);
  assert.match(js,/sourceDate,sourcePeriod,scheduleId/);
});

test('首次启动必须由用户选择教室，主进程不自动绑定默认教室',()=>{
  assert.match(js,/if\(!cfg\.roomId\)\{await openRoom\(\);return\}/);
  assert.doesNotMatch(main,/rooms\.find\(x=>x\.name==='机房1'\)\|\|rooms\[0\]/);
  assert.match(main,/ROOM_REQUIRED/);
  assert.match(preload,/'room-reset'/);
  assert.match(js,/desktop\.on\('room-reset'[\s\S]*openRoom\(\)/);
});

test('临时调课状态保留当前节次，便于面板显示实际课程',()=>{
  assert.match(server,/conflict:candidates\.length>1\?candidates:\[\],period\}/);
  assert.doesNotMatch(server,/period:candidates\.length\?period:null/);
  assert.match(js,/saved=await desktop\.call\('adjust'/);
  assert.match(js,/currentLesson:savedLesson/);
  assert.match(js,/localAdjustment=\{date,period,lesson:savedLesson/);
  assert.match(js,/\(saved\.students\|\|\[\]\)\.filter/);
  assert.match(server,/students=lessonRoster\(roomId,resolved\.lesson/);
});

test('Mac 麦克风权限由主进程按系统状态管理，避免重复触发授权',()=>{
  assert.match(main,/systemPreferences/);
  assert.match(main,/getMediaAccessStatus\('microphone'\)/);
  assert.match(main,/askForMediaAccess\('microphone'\)/);
  assert.match(main,/microphonePermissionPrompted/);
  assert.match(main,/case 'microphone-status'/);
  assert.match(main,/case 'request-microphone'/);
  assert.match(main,/details\.mediaTypes\?\.every\(t=>t==='audio'\)&&microphoneStatus\(\)==='granted'/);
  assert.match(main,/p==='media'&&microphoneStatus\(\)==='granted'/);
  assert.match(js,/desktop\.call\('microphone-status'\)/);
  assert.match(js,/desktop\.call\('request-microphone'\)/);
  assert.match(js,/microphonePrompted/);
});
