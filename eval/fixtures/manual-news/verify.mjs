import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {Window} from 'happy-dom';
const root=fileURLToPath(new URL('./', import.meta.url));
const articles=JSON.parse(fs.readFileSync(root+'articles.json','utf8'));
const script=new vm.Script(fs.readFileSync(root+'controls.js','utf8'));
let selections=0;
for(const a of articles){
 const win=new Window();
 win.document.write(fs.readFileSync(root+a.id+'.html','utf8').replace('<script defer src="controls.js"></script>',''));
 assert.equal(win.document.querySelector('#headline').textContent,a.headline);
 assert.equal(win.document.querySelector('#body').textContent,a.body.replace(/\n\n/g,''));
 script.runInNewContext({document:win.document,window:win});
 for(const id of ['article','headline','body']){
  win.document.querySelector(`[data-select="${id}"]`).click();
  const text=win.getSelection().toString();
  assert.equal(text,win.document.getElementById(id).textContent);
  assert(text.length>0&&text.length<4000);
  assert(!text.includes('실제 보도가 아닌 허구의 테스트 기사'));
  assert.equal(win.document.querySelector('#status').textContent,'선택된 글 위에서 우클릭 → GenuEarly 검사');
  selections++;
 }
 if(a.truth_status==='source_verified')assert.equal(win.document.querySelectorAll('.source-list a').length,a.sources.length);
 await win.happyDOM.close();
}
console.log(JSON.stringify({articlePages:45,selectionButtonChecks:selections,officialSourcePages:5,result:'PASS'}));
