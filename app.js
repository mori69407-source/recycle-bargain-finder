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
    $("resultList").innerHTML='<article class="item"><div class="number">1</div><div><h3>'+escapeHtml(item.name)+'</h3>'+(item.brand!=="不明"?'<p><b>メーカー：</b>'+escapeHtml(item.brand)+'</p>':'')+(item.model!=="不明"?'<p><b>型番・シリーズ：</b>'+escapeHtml(item.model)+'</p>':'')+'<p><b>AI確度：</b>'+Math.round(item.confidence*100)+'%</p><p class="muted">'+escapeHtml(item.reason)+'</p></div></article>';
  }catch(e){
    console.error(e);
    $("resultList").innerHTML='<div class="loading"><b>AI解析できませんでした。</b><br><br>'+escapeHtml(e.message||String(e))+'<br><br>商品が大きく写った写真で、もう一度試してください。</div>';
  }
});

async function askVision(dataUrl){
  const mod=await import("https://cdn.jsdelivr.net/npm/@gradio/client@1.15.0/dist/index.min.js");
  const Client=mod.Client,handle_file=mod.handle_file;
  const app=await Client.connect("https://developer0hye-qwen25-vl-7b-instruct.hf.space",{events:["data","status"]});
  const prompt='画像に写っている商品を1個だけ認識してください。背景や棚は無視してください。商品名、メーカー/ブランド、型番/シリーズ、理由、確度を日本語でJSONのみ返してください。分からない情報は不明。形式: {"name":"商品名","brand":"不明","model":"不明","confidence":0.0,"reason":"理由"}';
  const job=app.submit("/qwen_vl_inference",[handle_file(dataUrlToBlob(dataUrl)),prompt]);
  let lastStatus="";
  for await(const msg of job){
    if(msg.type==="status"){
      lastStatus=msg.stage||"";
      if(msg.stage==="error"){
        throw new Error(msg.message||"AI側で解析エラーが発生しました。");
      }
    }
    if(msg.type==="data"){
      const data=msg.data;
      if(!data)throw new Error("AIから結果が返りませんでした。");
      return Array.isArray(data)?String(data[0]||""):String(data);
    }
  }
  throw new Error(lastStatus==="pending"||lastStatus==="generating"?"AIの処理が終了しませんでした。もう一度お試しください。":"AIから解析結果が返りませんでした。");
}
function parseOne(text){
  const m=String(text).match(/\{[\s\S]*\}/);
  if(!m)return null;
  try{const x=JSON.parse(m[0]);return x.name?{name:String(x.name),brand:String(x.brand||"不明"),model:String(x.model||"不明"),confidence:Math.max(0,Math.min(1,Number(x.confidence)||0)),reason:String(x.reason||"")} : null}catch(e){return null;}
}
function dataUrlToBlob(s){const p=s.split(","),mime=(p[0].match(/data:([^;]+)/)||[])[1]||"image/jpeg",b=atob(p[1]),a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return new Blob([a],{type:mime});}
async function resizeImage(src,max,q){const img=new Image();img.src=src;await new Promise((r,j)=>{img.onload=r;img.onerror=j});const sc=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight)),c=document.createElement("canvas");c.width=Math.round(img.naturalWidth*sc);c.height=Math.round(img.naturalHeight*sc);c.getContext("2d").drawImage(img,0,0,c.width,c.height);return c.toDataURL("image/jpeg",q);}
$("newSearch").addEventListener("click",()=>{photo=null;$("preview").style.display="none";$("video").style.display="block";$("analyze").disabled=true;show("home");});
$("back").addEventListener("click",()=>show("home"));
function show(id){["home","results","detail"].forEach(x=>$(x).hidden=x!==id);window.scrollTo(0,0);}
function escapeHtml(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}