const $=id=>document.getElementById(id);
let stream=null,photo=null;

async function startCamera(){
  try{
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia) throw new Error("camera");
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"},audio:false});
    const video=$("video");
    video.srcObject=stream;
    video.style.display="block";
    $("preview").style.display="none";
    $("cameraHint").style.display="none";
    $("takePhoto").disabled=false;
  }catch(e){
    alert("カメラを起動できませんでした。iPhoneの「設定 → Safari → カメラ」で、このサイトのカメラを許可してください。許可済みなら「写真を選ぶ」を使えます。");
  }
}
$("startCamera").addEventListener("click",startCamera);

$("takePhoto").addEventListener("click",()=>{
  const video=$("video"),canvas=$("canvas");
  if(!video.videoWidth){alert("カメラの映像がまだ準備できていません。");return;}
  canvas.width=video.videoWidth;canvas.height=video.videoHeight;
  canvas.getContext("2d").drawImage(video,0,0);
  setPhoto(canvas.toDataURL("image/jpeg",0.82));
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
});

$("fileInput").addEventListener("change",e=>{
  const file=e.target.files&&e.target.files[0];
  if(!file)return;
  const reader=new FileReader();
  reader.onload=()=>setPhoto(reader.result);
  reader.readAsDataURL(file);
});

function setPhoto(src){
  photo=src;
  $("preview").src=src;
  $("preview").style.display="block";
  $("video").style.display="none";
  $("cameraHint").style.display="none";
  $("analyze").disabled=false;
}

$("analyze").addEventListener("click",async()=>{
  if(!photo)return;
  show("results");
  $("resultList").innerHTML='<div class="loading"><b>AI解析中です…</b><br><br>商品1個だけを解析します。</div>';
  try{
    const text=await askVision(await resizeImage(photo,1100,0.72));
    const item=parseOne(text);
    if(!item)throw new Error("商品を特定できませんでした。");
    const crop=makeCrop(photo,item.box);
    $("resultList").innerHTML='<article class="item"><div class="number">1</div>'+(crop?'<img class="thumb crop" src="'+crop+'" alt="AIが認識した商品">':'<div class="thumb"></div>')+'<div><h3>'+escapeHtml(item.name)+'</h3>'+(item.brand!=="不明"?'<p><b>メーカー：</b>'+escapeHtml(item.brand)+'</p>':'')+(item.model!=="不明"?'<p><b>型番・シリーズ：</b>'+escapeHtml(item.model)+'</p>':'')+'<p><b>AI確度：</b>'+Math.round(item.confidence*100)+'%</p><p class="muted">'+escapeHtml(item.reason)+'</p></div></article>'
  }catch(e){
    console.error(e);
    $("resultList").innerHTML='<div class="loading"><b>AI解析できませんでした。</b><br><br>'+escapeHtml(e.message||String(e))+'<br><br>商品が大きく写った写真で、もう一度試してください。</div>';
  }
});

async function askVision(dataUrl){
  const mod=await import("https://cdn.jsdelivr.net/npm/@gradio/client/dist/index.min.js");
  const Client=mod.Client,handle_file=mod.handle_file;
  let app;
  try{app=await Client.connect("developer0hye/Qwen2.5-VL-7B-Instruct");}
  catch(e){throw new Error("AIサービスに接続できません: "+(e.message||e));}
  try{
    const file=handle_file(dataUrlToBlob(dataUrl));
    const prompt='画像に写っている商品を1個だけ認識してください。背景や棚は無視してください。商品名、メーカー/ブランド、型番/シリーズ、理由、確度、画像内の商品の位置を日本語でJSONのみ返してください。商品の位置は画像全体を1000x1000とした相対座標で、左上をx=0,y=0としてbox:{x,y,w,h}で返してください。商品全体を囲む大きめの矩形にしてください。分からない情報は不明。必ずboxを含めてください。形式: {"name":"商品名","brand":"不明","model":"不明","confidence":0.0,"reason":"理由","box":{"x":100,"y":100,"w":800,"h":800}}';
    const job=app.submit("/qwen_vl_inference",[file,prompt]);
    for await(const msg of job){
      if(msg.type==="status" && msg.stage==="error") throw new Error(msg.message||"AI側でエラーが発生しました。");
      if(msg.type==="data"){
        if(!msg.data) throw new Error("AIから空の結果が返りました。");
        return Array.isArray(msg.data)?String(msg.data[0]||""):String(msg.data);
      }
    }
    throw new Error("AIから解析結果が返りませんでした。");
  }catch(e){
    console.error("AI ERROR",e);
    throw new Error(e.message||String(e));
  }
}
function parseOne(text){
  const m=String(text).match(/\{[\s\S]*\}/);
  if(!m)return null;
  try{const x=JSON.parse(m[0]);return x.name?{name:String(x.name),brand:String(x.brand||"不明"),model:String(x.model||"不明"),confidence:Math.max(0,Math.min(1,Number(x.confidence)||0)),reason:String(x.reason||""),box:{x:Number(x.box?.x)||0,y:Number(x.box?.y)||0,w:Number(x.box?.w)||0,h:Number(x.box?.h)||0}} : null}catch(e){return null;}
}
function dataUrlToBlob(s){const p=s.split(","),mime=(p[0].match(/data:([^;]+)/)||[])[1]||"image/jpeg",b=atob(p[1]),a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return new Blob([a],{type:mime});}
async function resizeImage(src,max,q){const img=new Image();img.src=src;await new Promise((r,j)=>{img.onload=r;img.onerror=j});const sc=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight)),c=document.createElement("canvas");c.width=Math.round(img.naturalWidth*sc);c.height=Math.round(img.naturalHeight*sc);c.getContext("2d").drawImage(img,0,0,c.width,c.height);return c.toDataURL("image/jpeg",q);}
$("newSearch").addEventListener("click",()=>{photo=null;$("preview").style.display="none";$("video").style.display="block";$("analyze").disabled=true;show("home");});
$("back").addEventListener("click",()=>show("home"));
function show(id){["home","results","detail"].forEach(x=>$(x).hidden=x!==id);window.scrollTo(0,0);}
function escapeHtml(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function makeCrop(src,box){
  if(!src||!box||box.w<5||box.h<5)return "";
  const img=$("preview");
  if(!img.naturalWidth||!img.naturalHeight)return "";
  const sx=Math.max(0,Math.round(box.x/1000*img.naturalWidth));
  const sy=Math.max(0,Math.round(box.y/1000*img.naturalHeight));
  const sw=Math.min(img.naturalWidth-sx,Math.round(box.w/1000*img.naturalWidth));
  const sh=Math.min(img.naturalHeight-sy,Math.round(box.h/1000*img.naturalHeight));
  if(sw<5||sh<5)return "";
  const c=document.createElement("canvas"),scale=Math.min(1,500/Math.max(sw,sh));
  c.width=Math.max(80,Math.round(sw*scale));c.height=Math.max(80,Math.round(sh*scale));
  c.getContext("2d").drawImage(img,sx,sy,sw,sh,0,0,c.width,c.height);
  return c.toDataURL("image/jpeg",0.85);
}
