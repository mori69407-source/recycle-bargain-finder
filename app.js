const $=id=>document.getElementById(id);
let stream=null,photo=null,detectorPromise=null;

async function startCamera(){
  try{
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia) throw new Error("camera");
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"},audio:false});
    const video=$("video"); video.srcObject=stream; video.style.display="block";
    $("preview").style.display="none"; $("cameraHint").style.display="none"; $("takePhoto").disabled=false;
  }catch(e){alert("カメラを起動できませんでした。許可済みなら「写真を選ぶ」を使えます。");}
}
$("startCamera").addEventListener("click",startCamera);
$("takePhoto").addEventListener("click",()=>{
  const video=$("video"),canvas=$("canvas");
  if(!video.videoWidth){alert("カメラの映像がまだ準備できていません。");return;}
  canvas.width=video.videoWidth;canvas.height=video.videoHeight;
  canvas.getContext("2d").drawImage(video,0,0);setPhoto(canvas.toDataURL("image/jpeg",0.82));
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
});
$("fileInput").addEventListener("change",e=>{
  const file=e.target.files&&e.target.files[0];if(!file)return;
  const reader=new FileReader();reader.onload=()=>setPhoto(reader.result);reader.readAsDataURL(file);
});
function setPhoto(src){photo=src;$("preview").src=src;$("preview").style.display="block";$("video").style.display="none";$("cameraHint").style.display="none";$("analyze").disabled=false;}

$("analyze").addEventListener("click",async()=>{
  if(!photo)return;
  show("results");
  $("resultList").innerHTML='<div class="loading"><b>写真を解析しています…</b><br><br>初回はAIモデルの読み込みに少し時間がかかります。画像は端末のブラウザー内で解析します。</div>';
  $("analyze").disabled=true;
  try{
    const detector=await getDetector();
    const img=await loadImage(await resizeForDetection(photo,960));
    const inputCanvas=document.createElement("canvas");inputCanvas.width=img.naturalWidth;inputCanvas.height=img.naturalHeight;inputCanvas.getContext("2d").drawImage(img,0,0);const output=await detector(inputCanvas,{threshold:0.22});
    const items=selectItems(output).slice(0,3);
    if(!items.length)throw new Error("商品を検出できませんでした。商品が大きく写るように撮り直すか、明るい写真を選んでください。");
    $("resultList").innerHTML=items.map((item,i)=>{
      const crop=cropImage(img,item.box);
      const label=translateLabel(item.label);
      const query=encodeURIComponent(label+" 中古 ヴィンテージ");
      return '<article class="item"><div class="number">'+(i+1)+'</div>'+(crop?'<img class="thumb crop" src="'+crop+'" alt="検出した商品'+(i+1)+'">':'<div class="thumb"></div>')+'<div><h3>'+escapeHtml(label)+'</h3><p><b>検出の確度：</b>'+Math.round(item.score*100)+'%</p><p class="muted">これは物体の種類の推定です。ブランドや型番の特定ではありません。</p><a class="source" target="_blank" rel="noopener" href="https://www.google.com/search?tbm=isch&q='+query+'">似た商品を画像検索 ↗</a></div></article>';
    }).join("");
  }catch(e){
    console.error(e);
    $("resultList").innerHTML='<div class="loading"><b>検出できませんでした。</b><br><br>'+escapeHtml(e.message||String(e))+'<br><br><button id="retry" type="button">もう一度試す</button></div>';
    const retry=$("retry");if(retry)retry.addEventListener("click",()=>$("analyze").click());
  }finally{$("analyze").disabled=false;}
});

async function getDetector(){
  if(!detectorPromise){
    detectorPromise=(async()=>{
      const {pipeline,env}=await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1");
      env.allowLocalModels=false;
      return await pipeline("object-detection","Xenova/detr-resnet-50",{dtype:"q8"});
    })().catch(e=>{detectorPromise=null;throw new Error("AIモデルを読み込めませんでした。通信環境を確認して、もう一度お試しください。詳細: "+(e.message||e));});
  }
  return detectorPromise;
}
function selectItems(output){
  const seen=[];
  for(const x of (output||[]).sort((a,b)=>b.score-a.score)){
    if(!x.box||x.score<0.22)continue;
    const b=x.box,w=b.xmax-b.xmin,h=b.ymax-b.ymin;
    if(w<28||h<28)continue;
    const duplicate=seen.some(y=>intersectionOverUnion(y.box,b)>0.55);
    if(!duplicate)seen.push(x);
    if(seen.length>=3)break;
  }
  return seen;
}
function intersectionOverUnion(a,b){
  const x1=Math.max(a.xmin,b.xmin),y1=Math.max(a.ymin,b.ymin),x2=Math.min(a.xmax,b.xmax),y2=Math.min(a.ymax,b.ymax);
  const inter=Math.max(0,x2-x1)*Math.max(0,y2-y1);
  const aa=Math.max(0,a.xmax-a.xmin)*Math.max(0,a.ymax-a.ymin),bb=Math.max(0,b.xmax-b.xmin)*Math.max(0,b.ymax-b.ymin);
  return inter/(aa+bb-inter||1);
}
async function resizeForDetection(src,max){const original=await loadImage(src);const scale=Math.min(1,max/Math.max(original.naturalWidth,original.naturalHeight));if(scale===1)return src;const c=document.createElement('canvas');c.width=Math.round(original.naturalWidth*scale);c.height=Math.round(original.naturalHeight*scale);c.getContext('2d').drawImage(original,0,0,c.width,c.height);return c.toDataURL('image/jpeg',0.82);}
function loadImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=src;});}
function cropImage(img,b){
  const x=Math.max(0,Math.floor(b.xmin)),y=Math.max(0,Math.floor(b.ymin));
  const w=Math.min(img.naturalWidth-x,Math.ceil(b.xmax)-x),h=Math.min(img.naturalHeight-y,Math.ceil(b.ymax)-y);
  if(w<2||h<2)return "";
  const c=document.createElement("canvas"),scale=Math.min(1,480/Math.max(w,h));
  c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));
  c.getContext("2d").drawImage(img,x,y,w,h,0,0,c.width,c.height);
  return c.toDataURL("image/jpeg",0.84);
}
function translateLabel(s){
  const names={"teddy bear":"ぬいぐるみ（クマ）","cup":"カップ","bowl":"ボウル・器","vase":"花瓶","bottle":"ボトル","wine glass":"グラス","fork":"フォーク","knife":"ナイフ","spoon":"スプーン","dining table":"テーブル","book":"本","clock":"時計","vase":"花瓶","handbag":"バッグ","backpack":"リュック","remote":"リモコン","cell phone":"携帯電話","laptop":"ノートPC","scissors":"はさみ","toothbrush":"歯ブラシ","chair":"椅子","potted plant":"鉢植え","sports ball":"ボール","toy":"おもちゃ"};
  return names[s]||s;
}
$("newSearch").addEventListener("click",()=>{photo=null;$("preview").style.display="none";$("video").style.display="block";$("analyze").disabled=true;$("fileInput").value="";show("home");});
$("back").addEventListener("click",()=>show("home"));
function show(id){["home","results","detail"].forEach(x=>$(x).hidden=x!==id);window.scrollTo(0,0);}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
