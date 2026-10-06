const $=id=>document.getElementById(id);
let stream=null,photo=null,detector=null;

const jp={
  teddy:"ぬいぐるみ",cup:"カップ・食器",bowl:"ボウル・食器",vase:"花瓶",clock:"時計",
  backpack:"バッグ",handbag:"バッグ",suitcase:"バッグ・ケース",bottle:"ボトル",
  book:"本",laptop:"ノートPC",cell:"スマートフォン",remote:"リモコン",
  chair:"椅子",couch:"ソファ",dining:"テーブル",tv:"テレビ",scissors:"はさみ",
  sports:"ボール・玩具",kite:"玩具",baseball:"玩具",skateboard:"玩具"
};

$("startCamera").onclick=async()=>{
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
    $("video").srcObject=stream;$("cameraHint").style.display="none";$("takePhoto").disabled=false;
  }catch(e){alert("カメラを使えません。写真を選ぶボタンを使ってください。")}
};

$("takePhoto").onclick=()=>{
  const v=$("video"),c=$("canvas");
  c.width=v.videoWidth;c.height=v.videoHeight;c.getContext("2d").drawImage(v,0,0);
  setPhoto(c.toDataURL("image/jpeg",.9));
  if(stream)stream.getTracks().forEach(t=>t.stop());
};

$("fileInput").onchange=e=>{
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();r.onload=()=>setPhoto(r.result);r.readAsDataURL(f);
};

function setPhoto(src){
  photo=src;$("preview").src=src;$("preview").style.display="block";$("video").style.display="none";
  $("analyze").disabled=false;$("cameraHint").style.display="none";
}

$("analyze").onclick=async()=>{
  if(!photo)return;
  show("results");
  $("resultList").innerHTML='<div class="loading">AIが棚の中の物を探しています…<br><small>初回だけAIモデルの読み込みに少し時間がかかります</small></div>';
  try{
    if(!detector) detector=await cocoSsd.load({base:"lite_mobilenet_v2"});
    const img=new Image();img.src=photo;await img.decode();
    const predictions=await detector.detect(img,20,.28);
    const items=makeDistinct(predictions);
    if(!items.length){
      $("resultList").innerHTML='<div class="loading">はっきり識別できる物を見つけられませんでした。<br>物が大きく写るように、棚に近づいてもう一度撮影してください。</div>';
      return;
    }
    $("resultList").innerHTML=items.map((it,i)=>itemHtml(it,i)).join("");
  }catch(e){
    console.error(e);
    $("resultList").innerHTML='<div class="loading">解析に失敗しました。通信状態を確認して、もう一度試してください。</div>';
  }
};

function makeDistinct(predictions){
  const sorted=predictions
    .filter(p=>p.score>=.28)
    .sort((a,b)=>b.score-a.score);
  const out=[];
  for(const p of sorted){
    const [x,y,w,h]=p.bbox;
    if(w<35||h<35)continue;
    if(out.some(o=>iou(o.bbox,p.bbox)>.55))continue;
    out.push(p);
    if(out.length>=10)break;
  }
  return out;
}
function iou(a,b){
  const ax2=a[0]+a[2],ay2=a[1]+a[3],bx2=b[0]+b[2],by2=b[1]+b[3];
  const ix=Math.max(0,Math.min(ax2,bx2)-Math.max(a[0],b[0]));
  const iy=Math.max(0,Math.min(ay2,by2)-Math.max(a[1],b[1]));
  const inter=ix*iy, union=a[2]*a[3]+b[2]*b[3]-inter;
  return union?inter/union:0;
}

function labelFor(c){
  const m={
    "teddy bear":"ぬいぐるみ","cup":"カップ・食器","bowl":"ボウル・食器","vase":"花瓶",
    "clock":"時計","backpack":"バッグ","handbag":"バッグ","suitcase":"バッグ・ケース",
    "bottle":"ボトル","book":"本","laptop":"ノートPC","cell phone":"スマートフォン",
    "remote":"リモコン","chair":"椅子","couch":"ソファ","dining table":"テーブル",
    "tv":"テレビ","scissors":"はさみ","sports ball":"ボール・玩具","kite":"玩具",
    "baseball glove":"玩具","skateboard":"玩具","umbrella":"傘","frisbee":"玩具"
  };
  return m[c]||c;
}

function cropDataUrl(bbox){
  const src=$("preview"),c=document.createElement("canvas");
  const scaleX=src.naturalWidth/src.clientWidth||1,scaleY=src.naturalHeight/src.clientHeight||1;
  let [x,y,w,h]=bbox.map((v,i)=>v*(i<2?(i===0?scaleX:scaleY):i===2?scaleX:scaleY));
  const pad=Math.max(w,h)*.08;x=Math.max(0,x-pad);y=Math.max(0,y-pad);
  w=Math.min(src.naturalWidth-x,w+pad*2);h=Math.min(src.naturalHeight-y,h+pad*2);
  c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));
  c.getContext("2d").drawImage(src,x,y,w,h,0,0,c.width,c.height);
  return c.toDataURL("image/jpeg",.88);
}

function itemHtml(p,i){
  const crop=cropDataUrl(p.bbox);
  const name=labelFor(p.class);
  return '<article class="item"><img class="thumb crop" src="'+crop+'" alt="査定対象 '+(i+1)+'"><div><h3>'+(i+1)+". "+name+'</h3><p>AI識別: '+p.class+'　'+Math.round(p.score*100)+'%</p><span class="tag">この部分を査定</span><span class="tag">候補 '+(i+1)+'</span><br><button onclick="openDetail('+i+')">この物を詳しく調べる</button></div></article>';
}

let detectedItems=[];
function rebuildDetails(predictions){detectedItems=predictions}
const oldAnalyze=$("analyze").onclick;
window.openDetail=i=>{
  const p=detectedItems[i];
  if(!p){return}
  show("detail");
  const q=encodeURIComponent(labelFor(p.class)+" 中古 相場 商品");
  const crop=cropDataUrl(p.bbox);
  $("detailBody").innerHTML='<div class="detailCard"><img src="'+crop+'" alt=""><h2>'+labelFor(p.class)+'</h2><p class="muted">棚写真の中から、この枠の物を識別しました。識別名はAIの推定なので、メーカー名・型番までは確定していません。</p><a class="source" target="_blank" rel="noopener" href="https://www.google.com/search?tbm=isch&q='+q+'">🖼️ Google画像検索で比較する →</a><a class="source" target="_blank" rel="noopener" href="https://www.google.com/search?q='+q+'">🔎 Web検索で相場を見る →</a><a class="source" target="_blank" rel="noopener" href="https://search.yahoo.co.jp/search?p='+q+'">🔎 Yahoo!検索で調べる →</a></div>';
};

$("back").onclick=()=>show("results");
$("newSearch").onclick=()=>{
  photo=null;detectedItems=[];
  $("preview").style.display="none";$("video").style.display="block";$("analyze").disabled=true;show("home");
};
function show(id){["home","results","detail"].forEach(x=>$(x).hidden=x!==id);scrollTo(0,0)}

/* Keep detected predictions available for detail buttons. */
const originalAnalyzeHandler=$("analyze").onclick;
$("analyze").onclick=async()=>{
  if(!photo)return;
  show("results");
  $("resultList").innerHTML='<div class="loading">AIが棚の中の物を探しています…<br><small>初回だけAIモデルの読み込みに少し時間がかかります</small></div>';
  try{
    if(!detector) detector=await cocoSsd.load({base:"lite_mobilenet_v2"});
    const img=new Image();img.src=photo;await img.decode();
    detectedItems=makeDistinct(await detector.detect(img,20,.28));
    if(!detectedItems.length){
      $("resultList").innerHTML='<div class="loading">はっきり識別できる物を見つけられませんでした。<br>物が大きく写るように、棚に近づいてもう一度撮影してください。</div>';
      return;
    }
    $("resultList").innerHTML=detectedItems.map((it,i)=>itemHtml(it,i)).join("");
  }catch(e){console.error(e);$("resultList").innerHTML='<div class="loading">解析に失敗しました。もう一度試してください。</div>';}
};