const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'classroom-asr-'));process.env.DATA_DIR=dir;
const AI=require('../lib/ai');
test('ASR protocols preserve audio and parse responses',async t=>{
 const wav=Buffer.alloc(32044);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(32000,40);
 fs.writeFileSync(path.join(dir,'audio','test.wav'),wav);
 const record={audio_file:'test.wav',audio_type:'audio/wav'},text='完成了程序调试';
 for(const endpoint of ['/asr','/compatible-mode/v1','/api/v1/services/aigc/multimodal-generation/generation']){
  await t.test(endpoint,async()=>{
   const native=endpoint.includes('generation');
   t.mock.method(global,'fetch',async(url,request)=>{
    assert.equal(request.headers.Authorization,'Bearer test-key');
    if(endpoint==='/asr')assert.ok(request.body instanceof FormData);
    else{
     const body=JSON.parse(request.body),messages=native?body.input.messages:body.messages;
     const uri=native?messages[0].content[0].audio:messages[0].content[0].input_audio.data;
     const audio=Buffer.from(uri.split(',')[1],'base64');assert.equal(audio.toString('ascii',0,4),'RIFF');assert.equal(audio.readUInt32LE(4),audio.length-8);assert.equal(audio.readUInt32LE(24),16000);
     if(!native)assert.equal(new URL(url).pathname,'/compatible-mode/v1/chat/completions');
    }
    return Response.json(native?{output:{choices:[{message:{content:[{text}]}}]}}:endpoint==='/asr'?{text}:{choices:[{message:{content:text}}]});
   });
   assert.equal(await AI.transcribe(record,{url:'https://example.com'+endpoint,model:'qwen3-asr-flash',key:'test-key'}),text);
   t.mock.restoreAll();
  });
 }
 assert.deepEqual(fs.readFileSync(path.join(dir,'audio','test.wav')),wav);
 t.mock.method(global,'fetch',async()=>Response.json({error:{code:'invalid_api_key'}},{status:401}));
 await assert.rejects(AI.transcribe(record,{url:'https://example.com/asr',model:'test'}),/HTTP 401.*invalid_api_key/);
 t.mock.restoreAll();
});
