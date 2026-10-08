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
  $("resultList").innerHTML='<div class="loading"><b>AI解析中です…</b><br><br>写真から商品を最大10個探しています。</div>';
  try{
    const text=await askVision(await resizeImage(photo,1100,0.72));
    const items=parseMany(text);
    if(!items.length)throw new Error("商品を特定できませんでした。");
    $("resultList").innerHTML=items.map((item,i)=>{
      const crop=makeCrop(photo,item.box);
      return '<article class="item"><div class="number">'+(i+1)+'</div>'+(crop?'<img class="thumb crop" src="'+crop+'" alt="認識した商品">':'<div class="thumb"></div>')+'<div><h3>'+escapeHtml(item.name)+'</h3>'+(item.brand!=="不明"?'<p><b>メーカー：</b>'+escapeHtml(item.brand)+'</p>':'')+(item.model!=="不明"?'<p><b>型番・シリーズ：</b>'+escapeHtml(item.model)+'</p>':'')+'<p><b>AI確度：</b>'+Math.round(item.confidence*100)+'%</p><p class="muted">'+escapeHtml(item.reason)+'</p></div></article>';
    }).join('');
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
  const src=await imageInfo(dataUrl);
  const tiles=[
    {x:0,y:0,w:0.55,h:0.55},{x:0.45,y:0,w:0.55,h:0.55},
    {x:0,y:0.45,w:0.55,h:0.55},{x:0.45,y:0.45,w:0.55,h:0.55}
  ];
  const all=[];
  for(const t of tiles){
    const tile=await makeTile(dataUrl,t);
    const file=handle_file(dataUrlToBlob(tile));
    const prompt='この写真の中から、棚や背景ではなく「商品」だけを最大3個見つけてください。商品名は分かる範囲で簡潔にしてください。分からない商品も位置が分かれば「不明な商品」としてください。JSONや説明文は不要で、必ず次の形式の行だけを返してください。ITEM|商品名|メーカー|型番|確度(0-100)|x|y|w|h。x,y,w,hはこの写真全体を1000とした座標です。商品の本体をできるだけぴったり囲んでください。値札は商品に含めません。商品がなければNONEだけ返してください。';
    try{
      const job=app.submit("/qwen_vl_inference",[file,prompt]);
      for await(const msg of job){
        if(msg.type==="status"&&msg.stage==="error")throw new Error(msg.message||"AIエラー");
        if(msg.type==="data"){
          const out=Array.isArray(msg.data)?String(msg.data[0]||""):String(msg.data||"");
          all.push(...parseLines(out,t));
          break;
        }
      }
    }catch(e){console.warn("tile AI error",e);}
  }
  const unique=[];
  for(const item of all){
    const dup=unique.some(v=>Math.abs(v.box.x-item.box.x)<70&&Math.abs(v.box.y-item.box.y)<70);
    if(!dup)unique.push(item);
  }
  return JSON.stringify(unique.slice(0,10));
}
async function imageInfo(dataUrl){
  const img=new Image();img.src=dataUrl;
  await new Promise((r,j)=>{img.onload=r;img.onerror=j});
  return {w:img.naturalWidth,h:img.naturalHeight};
}
async function makeTile(src,t){
  const img=new Image();
  img.src=src;
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;});
  const c=document.createElement("canvas");
  const sw=Math.round(img.naturalWidth*t.w),sh=Math.round(img.naturalHeight*t.h);
  c.width=Math.min(900,sw);c.height=Math.min(900,sh);
  c.getContext("2d").drawImage(img,Math.round(img.naturalWidth*t.x),Math.round(img.naturalHeight*t.y),sw,sh,0,0,c.width,c.height);
  return c.toDataURL("image/jpeg",0.8);
}
function parseLines(text,t){
  const out=[];
  for(const line of String(text).split(/\\r?\\n/)){
    const p=line.trim().split("|");
    if(p[0]!=="ITEM"||p.length<9)continue;
    const name=p[1]&&p[1].trim();
    const x=Number(p[5]),y=Number(p[6]),w=Number(p[7]),h=Number(p[8]);
    if(!name||![x,y,w,h].every(Number.isFinite)||w<5||h<5)continue;
    out.push({name,brand:p[2]?.trim()||"不明",model:p[3]?.trim()||"不明",confidence:Math.max(0,Math.min(1,(Number(p[4])||0)/100)),reason:"棚写真からAIが検出",box:{
      x:(t.x+x/1000*t.w)*1000,y:(t.y+y/1000*t.h)*1000,w:w*t.w,h:h*t.h
    }});
  }
  return out;
}
function parseMany(text){
  let raw=String(text).trim().replace(/^\`\`\`(?:json)?/i,"").replace(/\`\`\`$/,"").trim();
  let arr=[];
  const first=raw.indexOf("[");
  const last=raw.lastIndexOf("]");
  if(first>=0&&last>first){
    try{arr=JSON.parse(raw.slice(first,last+1));}catch(e){}
  }
  if(!arr.length){
    const firstObj=raw.indexOf("{"),lastObj=raw.lastIndexOf("}");
    if(firstObj>=0&&lastObj>firstObj){
      try{arr=[JSON.parse(raw.slice(firstObj,lastObj+1))];}catch(e){}
    }
  }
  if(!Array.isArray(arr))arr=[arr];
  return arr.map(x=>x&&x.name?{
    name:String(x.name),
    brand:String(x.brand||"不明"),
    model:String(x.model||"不明"),
    confidence:Math.max(0,Math.min(1,Number(x.confidence)||0)),
    reason:String(x.reason||""),
    box:{
      x:Number(x.box?.x)||0,
      y:Number(x.box?.y)||0,
      w:Number(x.box?.w)||0,
      h:Number(x.box?.h)||0
    }
  }:null).filter(Boolean).slice(0,10);
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
