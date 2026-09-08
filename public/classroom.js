(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  // 状态变量
  let config = {
    server: localStorage.getItem('cr_server') || '',
    token: localStorage.getItem('cr_token') || '',
    roomId: localStorage.getItem('cr_room') || '',
    autoCollapse: localStorage.getItem('cr_auto_collapse') !== 'false'
  };

  let state = {
    room: null,
    classes: [],
    students: [],
    schedule: [],
    currentLesson: null,
    currentClassId: null,
    isDeviceMode: false,
    offline: false,
    rooms: []
  };

  let recording = {
    active: false,
    student: null,
    stream: null,
    recorder: null,
    chunks: [],
    blob: null,
    timer: null,
    seconds: 0,
    recordId: null,
    recordedAt: null,
    busy: false
  };

  // 离线队列存储 (基于 IndexedDB)
  const DB_NAME = 'classroom_offline_queue';
  const STORE_NAME = 'pending_records';

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function queueRecord(recordItem) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(recordItem);
      tx.oncomplete = () => {
        updateQueueUI();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getQueue() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function removeQueuedRecord(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => {
        updateQueueUI();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  async function updateQueueUI() {
    const queue = await getQueue();
    const tag = $('#offline-tag');
    const count = $('#queue-count');
    if (queue.length > 0) {
      tag.hidden = false;
      count.textContent = queue.length;
    } else {
      tag.hidden = true;
    }
  }

  // 离线续传任务
  let flushing = false;
  async function flushQueue() {
    if (flushing) return;
    flushing = true;
    try {
      const queue = await getQueue();
      for (const item of queue) {
        try {
          await api('/api/records', 'POST', item.payload, item.token);
          await removeQueuedRecord(item.id);
          showToast(`补传成功: ${item.studentName} 的课堂记录`);
        } catch (e) {
          // 依然离线，等待下次重试
          break;
        }
      }
    } finally {
      flushing = false;
      await updateQueueUI();
    }
  }

  // 通用 HTTP 请求
  async function api(path, method = 'GET', body = null, tokenOverride = null) {
    const base = config.server || window.location.origin;
    const url = new URL(path, base);
    const headers = { 'Content-Type': 'application/json' };
    
    const token = tokenOverride || config.token;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (config.roomId) headers['X-Classroom-Room'] = config.roomId;

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin'
    });

    if (!res.ok) {
      let errText = '请求失败 (' + res.status + ')';
      try {
        const j = await res.json();
        if (j.error) errText = j.error;
      } catch {}
      const err = new Error(errText);
      err.status = res.status;
      throw err;
    }

    return res.json();
  }

  function showToast(msg) {
    $('#status-text').textContent = msg;
  }

  // 初始化检查与读取
  async function init() {
    // 1. 检查 URL 是否带 token
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    if (tokenFromUrl) {
      config.token = tokenFromUrl;
      localStorage.setItem('cr_token', tokenFromUrl);
      urlParams.delete('token');
      const cleanUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
      window.history.replaceState({}, '', cleanUrl);
    }

    // 绑定事件
    setupEvents();

    // 加载数据
    await loadClassroomState();

    // 更新离线队列
    await updateQueueUI();
    setInterval(flushQueue, 15000);
    window.addEventListener('online', flushQueue);
  }

  // 加载教室状态
  async function loadClassroomState() {
    $('#status-text').textContent = '正在获取教室信息…';
    try {
      if (config.token) {
        // 设备码模式
        const res = await api('/api/device/state');
        state.isDeviceMode = true;
        state.room = res.room;
        state.rooms = res.rooms || (res.room ? [res.room] : []);
        if (!state.rooms.length) {
          try { state.rooms = (await api('/api/device/rooms')).rooms || []; } catch {}
        }
        state.classes = res.classes || [];
        state.students = res.students || [];
        state.schedule = res.config?.schedule || [];
        const slots = res.current || [];
        state.currentLesson = res.currentLesson || (slots.length === 1 ? slots[0] : null);
        state.currentConflict = res.currentConflict || (slots.length > 1 ? slots : []);
        state.currentSource = res.currentSource || null;
        state.currentPeriod = res.currentPeriod || null;
        state.periods = res.periods || [];
        state.currentClassId = state.currentLesson ? state.currentLesson.class_id : (state.currentClassId || state.classes[0]?.id);

        $('#room-name').textContent = state.room ? state.room.name : '未知教室';
        renderLessonInfo();
        renderClassOptions();
        renderSeats();
        showToast('就绪：点击学生姓名即可录音');
      } else {
        // 用户会话模式（备用）
        const userState = await api('/api/state');
        state.isDeviceMode = false;
        state.room = userState.rooms[0] || null;
        state.rooms = userState.rooms || [];
        state.classes = userState.classes || [];
        state.students = userState.students || [];
        state.schedule = userState.schedule || [];
        state.currentLesson = null;
        state.currentConflict = [];
        state.currentSource = null;
        state.currentPeriod = null;
        state.currentClassId = state.currentClassId || state.classes[0]?.id;

        $('#room-name').textContent = (state.room ? state.room.name : '未选教室') + ' (教师登录模式)';
        renderLessonInfo();
        renderClassOptions();
        renderSeats();
        showToast('已登录：点击学生姓名即可录音');
      }
    } catch (err) {
      if (err.status === 401) {
        $('#status-text').textContent = '未绑定设备或未登录，请点击右上角设置绑定码';
        $('#modal-settings').showModal();
      } else {
        $('#status-text').textContent = '连接失败：' + err.message;
      }
    }
  }

  // 渲染节次与课表徽章
  function renderLessonInfo() {
    const badge = $('#schedule-badge');
    const info = $('#lesson-info');
    if (state.currentConflict?.length) {
      badge.classList.add('offline');
      info.textContent = `第${state.currentPeriod || '?'}节课表冲突，请联系管理员`;
    } else if (state.currentLesson) {
      badge.classList.remove('offline');
      info.textContent = `第${state.currentLesson.period || '?'}节 · ${state.currentLesson.subject}（${state.currentLesson.teacher || '教师'}）${state.currentSource === 'temporary' ? ' · 临时调课' : ''}`;
    } else {
      badge.classList.add('offline');
      info.textContent = '当前节次无排课 (可手动选择班级)';
    }
  }

  // 渲染班级选择器
  function renderClassOptions() {
    const sel = $('#class-select');
    sel.innerHTML = '';
    state.classes.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      if (c.id === state.currentClassId) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.disabled = state.isDeviceMode && (!!state.currentLesson || !!state.currentConflict?.length);
  }

  // 渲染 6x6 座位表
  function renderSeats() {
    const grid = $('#seating-grid');
    grid.innerHTML = '';

    const activeCid = state.currentClassId;

    // 6行6列，共36格
    // 座位表第1排靠近讲台；讲台在底部时按第6排到第1排渲染。
    for (let r = 6; r >= 1; r--) {
      for (let c = 1; c <= 6; c++) {
        // 在列 2 与 列 3 之间、列 4 与 列 5 之间插入走道间隙
        if (c === 3 && r === 1) {
          const gap = document.createElement('div');
          gap.className = 'aisle-gap';
          grid.appendChild(gap);
        }
        if (c === 5 && r === 1) {
          const gap = document.createElement('div');
          gap.className = 'aisle-gap';
          grid.appendChild(gap);
        }

        // 查找属于当前班级且座位的学生
        const student = state.students.find(s => 
          (s.classId === activeCid || s.class_id === activeCid) &&
          s.row === r && s.col === c
        );

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'seat-btn';
        btn.dataset.row = r;
        btn.dataset.col = c;

        if (student) {
          btn.innerHTML = `<span>${escapeHTML(student.name)}</span><span class="seat-num">${r}排${c}列</span>`;
          if (recording.student && recording.student.id === student.id) {
            btn.classList.add('active');
          }
          btn.onclick = () => onSelectStudent(student, btn);
          if (!state.currentLesson || state.currentConflict?.length) btn.disabled = true;
        } else {
          btn.className += ' empty';
          btn.innerHTML = `<span>空座</span><span class="seat-num">${r}-${c}</span>`;
          btn.disabled = true;
        }

        grid.appendChild(btn);
      }
    }
  }

  function escapeHTML(str) {
    return String(str || '').replace(/[&<>'"]/g, tag => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag));
  }

  // 选中学生并开始录音
  async function onSelectStudent(student, btnElement) {
    if (recording.active) {
      if (recording.student?.id === student.id) return;
      showToast('请先完成或取消当前学生的录音');
      return;
    }

    recording.active = true;
    recording.student = student;
    recording.recordId = crypto.randomUUID();
    recording.recordedAt = new Date().toISOString();
    recording.chunks = [];
    recording.blob = null;
    recording.seconds = 0;

    $('#rec-student-name').textContent = student.name;
    $('#rec-note').value = '';
    $('#rec-timer').textContent = '准备中…';
    $('#record-panel').hidden = false;
    $('#class-select').disabled = true;

    // 高亮座位
    $$('.seat-btn').forEach(b => b.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');

    // 申请麦克风
    try {
      recording.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recording.recorder = new MediaRecorder(recording.stream);
      recording.recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) recording.chunks.push(e.data);
      };
      recording.recorder.start();

      $('#rec-timer').textContent = '00:00';
      recording.timer = setInterval(() => {
        recording.seconds++;
        const mins = String(Math.floor(recording.seconds / 60)).padStart(2, '0');
        const secs = String(recording.seconds % 60).padStart(2, '0');
        $('#rec-timer').textContent = `${mins}:${secs}`;
      }, 1000);

      showToast(`正在录制 ${student.name} 的课堂表现…`);
      $('#rec-note').focus();
    } catch (err) {
      $('#rec-timer').textContent = '文字模式';
      showToast('未开启麦克风权限，可直接输入评价文字并保存');
    }
  }

  // 停止录音
  function stopMediaTracks() {
    clearInterval(recording.timer);
    if (recording.recorder && recording.recorder.state === 'recording') {
      return new Promise(resolve => {
        recording.recorder.onstop = () => {
          recording.blob = new Blob(recording.chunks, {
            type: recording.recorder.mimeType || 'audio/webm'
          });
          resolve();
        };
        recording.recorder.stop();
      });
    }
    if (recording.stream) {
      recording.stream.getTracks().forEach(t => t.stop());
    }
    return Promise.resolve();
  }

  // 取消录音
  async function cancelRecording() {
    if (!recording.active || recording.busy) return;
    await stopMediaTracks();
    resetRecordingUI();
    showToast('已取消本次记录');
  }

  // 完成记录
  async function finishRecording() {
    if (!recording.active || recording.busy) return;
    recording.busy = true;
    $('#btn-finish-rec').disabled = true;

    try {
      await stopMediaTracks();
      const text = $('#rec-note').value.trim();

      if (!text && (!recording.blob || recording.blob.size === 0)) {
        throw new Error('请录制声音或输入文字评价');
      }

      let encodedAudio = null;
      if (recording.blob && recording.blob.size > 0) {
        encodedAudio = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(recording.blob);
        });
      }

      const payload = {
        id: recording.recordId,
        studentId: recording.student.id,
        classId: state.currentClassId,
        roomId: state.room ? state.room.id : undefined,
        transcript: encodedAudio ? '' : text,
        note: encodedAudio ? text : '',
        audio: encodedAudio,
        recordedAt: recording.recordedAt
      };

      // 尝试直传
      try {
        await api('/api/records', 'POST', payload);
        showToast(`已成功保存：${recording.student.name} 的课堂随记`);
      } catch (postErr) {
        // 直传失败，保存至离线队列
        await queueRecord({
          id: recording.recordId,
          studentName: recording.student.name,
          payload,
          token: config.token,
          createdAt: Date.now()
        });
        showToast(`网络未连接，已暂存在本机待上传队列`);
      }

      resetRecordingUI();
    } catch (e) {
      showToast('保存失败：' + e.message);
    } finally {
      recording.busy = false;
      $('#btn-finish-rec').disabled = false;
    }
  }

  function resetRecordingUI() {
    recording.active = false;
    recording.student = null;
    recording.recorder = null;
    recording.stream = null;
    recording.blob = null;
    recording.chunks = [];

    $('#record-panel').hidden = true;
    $('#class-select').disabled = false;
    $$('.seat-btn').forEach(b => b.classList.remove('active'));
  }

  // 事件监听设置
  function setupEvents() {
    // 班级选择切换
    $('#class-select').addEventListener('change', e => {
      state.currentClassId = e.target.value;
      renderSeats();
    });

    // 录音取消与完成
    $('#btn-cancel-rec').addEventListener('click', cancelRecording);
    $('#btn-finish-rec').addEventListener('click', finishRecording);

    // 回车快速完成
    $('#rec-note').addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finishRecording();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelRecording();
      }
    });

    // 全屏切换
    $('#btn-fullscreen').addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    // 设置弹窗
    $('#btn-settings').addEventListener('click', () => {
      $('#input-server').value = config.server;
      $('#input-token').value = config.token;
      $('#check-auto-collapse').checked = config.autoCollapse;
      $('#token-status').textContent = config.token ? '已配置设备绑定码' : '未配置绑定码（使用登录态访问）';
      fillLessonSettings();
      $('#modal-settings').showModal();
    });

    $('#btn-close-settings').addEventListener('click', () => {
      $('#modal-settings').close();
    });

    $('#btn-clear-settings').addEventListener('click', () => {
      config.token = '';
      localStorage.removeItem('cr_token');
      $('#input-token').value = '';
      $('#token-status').textContent = '已清除绑定码';
    });

    $('#btn-save-settings').addEventListener('click', async () => {
      config.server = $('#input-server').value.trim();
      config.token = $('#input-token').value.trim();
      config.autoCollapse = $('#check-auto-collapse').checked;
      config.roomId = $('#input-room').value;
      localStorage.setItem('cr_room', config.roomId);

      localStorage.setItem('cr_server', config.server);
      localStorage.setItem('cr_token', config.token);
      localStorage.setItem('cr_auto_collapse', config.autoCollapse);

      $('#modal-settings').close();
      const classId = $('#input-class').value;
      const period = Number($('#input-period').value);
      const subject = $('#input-subject').value.trim();
      const teacher = $('#input-teacher').value.trim();
      if (config.token && classId && period && subject && teacher) {
        await api('/api/device/adjustments', 'POST', {date: new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Shanghai'}).format(new Date()), period, classId, subject, teacher, reason: '采集端设置'});
      }
      await loadClassroomState();
    });
  }

  function fillLessonSettings() {
    const rooms = state.rooms.length ? state.rooms : (state.room ? [state.room] : []);
    const room = $('#input-room');
    room.innerHTML = rooms.map(r => `<option value="${escapeHTML(r.id)}">${escapeHTML(r.name)}</option>`).join('');
    if (state.room) room.value = state.room.id;
    const classes = state.classes || [];
    const classSelect = $('#input-class');
    classSelect.innerHTML = classes.map(c => `<option value="${escapeHTML(c.id)}">${escapeHTML(c.name)}</option>`).join('');
    classSelect.value = state.currentClassId || classes[0]?.id || '';
    const periods = state.periods || [];
    $('#input-period').innerHTML = periods.map(p => `<option value="${p.number}">第${p.number}节（${p.start}—${p.end}）</option>`).join('');
    if (state.currentPeriod) $('#input-period').value = state.currentPeriod;
    const matches = (state.schedule || []).filter(s => (s.classId || s.class_id) === classSelect.value && Number(s.period) === Number($('#input-period').value));
    $('#input-subject').value = matches[0]?.subject || state.currentLesson?.subject || '';
    $('#input-teacher').value = matches[0]?.teacher || state.currentLesson?.teacher || '';
    classSelect.onchange = fillLessonFields;
    $('#input-period').onchange = fillLessonFields;
  }

  function fillLessonFields() {
    const matches = (state.schedule || []).filter(s => (s.classId || s.class_id) === $('#input-class').value && Number(s.period) === Number($('#input-period').value));
    if (matches[0]) { $('#input-subject').value = matches[0].subject || ''; $('#input-teacher').value = matches[0].teacher || ''; }
  }

  // 启动
  document.addEventListener('DOMContentLoaded', init);
})();
