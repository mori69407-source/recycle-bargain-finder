import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";

env.allowLocalModels = false;
env.useBrowserCache = true;

const $=id=>document.getElementById(id);
let stream=null,photo=null,detector=null,detectedItems=[];

const labels=[
  "a plush toy.","a stuffed animal.","a figurine.","a toy.","a plate.","a dish.","a bowl.",
  "a cup.","a mug.","a ceramic object.","a glass object.","a vase.","a pot.","a clock.",
  "a bag.","a purse.","a wallet.","a decorative object.","an ornament.","a book.","a box."
];

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
  $("resultList").innerHTML='<div class="loading">AIが棚の中の商品を探しています…<br><small>初回はAIモデルの読み込みに時間がかかります。画面を閉じないでください。</small></div>';
  try{
    if(!detector){
      detector=await pipeline("zero-shot-object-detection","onnx-community/grounding-dino-tiny-ONNX",{device:"wasm"});
    }
    const results=await detector(photo,labels,{threshold:.18,top_k:30});
    detectedItems=dedupe(results).slice(0,10);
    if(!detectedItems.length){
      $("resultList").innerHTML='<div class="loading">商品をはっきり検出できませんでした。<br><br>棚全体ではなく、商品がもう少し大きく写るように撮影してください。</div>';
      return;
    }
    $("resultList").innerHTML=detectedItems.map((p,i)=>itemHtml(p,i)).join("");
  }catch(e){
    console.error(e);
    $("resultList").innerHTML='<div class="loading"><b>AI解析を開始できませんでした。</b><br><br>モデルの読み込みに失敗しています。Safariを再読み込みして、もう一度試してください。<br><small>'+escapeHtml(e.message||String(e))+'</small></div>';
  }
};

function dedupe(results){
  const sorted=results.filter(x=>x.score>=.18).sort((a,b)=>b.score-a.score),out=[];
  for(const p of sorted){
    const b=boxArray(p.box);
    if(b[2]-b[0]<40||b[3]-b[1]<40)continue;
    if(out.some(o=>iou(boxArray(o.box),b)>.45))continue;
    out.push(p);
  }
  return out;
}
function boxArray(b){return [b.xmin,b.ymin,b.xmax,b.ymax]}
function iou(a,b){
  const x1=Math.max(a[0],b[0]),y1=Math.max(a[1],b[1]),x2=Math.min(a[2],b[2]),y2=Math.min(a[3],b[3]);
  const inter=Math.max(0,x2-x1)*Math.max(0,y2-y1);
  const ua=(a[2]-a[0])*(a[3]-a[1]),ub=(b[2]-b[0])*(b[3]-b[1]);
  return inter/(ua+ub-inter||1);
}
function labelFor(s){
  return s.replace(/^an? /,"").replace(/\.$/,"").replace(/^a /,"").replace(/^an /,"");
}
function jp(s){
  const m={"plush toy":"ぬいぐるみ","stuffed animal":"ぬいぐるみ","figurine":"フィギュア・置物","toy":"おもちゃ",
  "plate":"皿","dish":"食器","bowl":"ボウル","cup":"カップ","mug":"マグカップ","ceramic object":"陶器・磁器",
  "glass object":"ガラス製品","vase":"花瓶・壺","pot":"器・鉢","clock":"時計","bag":"バッグ","purse":"バッグ",
  "wallet":"財布","decorative object":"置物・インテリア","ornament":"置物・装飾品","book":"本","box":"箱・ケース"};
  return m[labelFor(s)]||labelFor(s);
}
function cropDataUrl(box){
  const src=$("preview"),c=document.createElement("canvas");
  let x=box.xmin,y=box.ymin,w=box.xmax-box.xmin,h=box.ymax-box.ymin;
  const pad=Math.max(w,h)*.08;x=Math.max(0,x-pad);y=Math.max(0,y-pad);
  w=Math.min(src.naturalWidth-x,w+pad*2);h=Math.min(src.naturalHeight-y,h+pad*2);
  c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));
  c.getContext("2d").drawImage(src,x,y,w,h,0,0,c.width,c.height);
  return c.toDataURL("image/jpeg",.88);
}
function itemHtml(p,i){
  const crop=cropDataUrl(p.box),name=jp(p.label);
  return '<article class="item"><img class="thumb crop" src="'+crop+'" alt="査定対象 '+(i+1)+'"><div><h3>'+(i+1)+". "+name+'</h3><p>AI推定：'+Math.round(p.score*100)+'%</p><span class="tag">この部分を査定</span><br><button onclick="openDetail('+i+')">この物を詳しく調べる</button></div></article>';
}
window.openDetail=i=>{
  const p=detectedItems[i];if(!p)return;
  show("detail");
  const name=jp(p.label),q=encodeURIComponent(name+" 中古 相場 商品");
  $("detailBody").innerHTML='<div class="detailCard"><img src="'+cropDataUrl(p.box)+'" alt=""><h2>'+name+'</h2><p class="muted">棚写真からAIが検出した対象です。商品名・メーカー・型番はまだ確定ではありません。</p><a class="source" target="_blank" rel="noopener" href="https://www.google.com/search?tbm=isch&q='+q+'">🖼️ Google画像検索で比較する →</a><a class="source" target="_blank" rel="noopener" href="https://www.google.com/search?q='+q+'">🔎 Web検索で相場を見る →</a><a class="source" target="_blank" rel="noopener" href="https://search.yahoo.co.jp/search?p='+q+'">🔎 Yahoo!検索で調べる →</a></div>';
};
$("back").onclick=()=>show("results");
$("newSearch").onclick=()=>{
  photo=null;detectedItems=[];$("preview").style.display="none";$("video").style.display="block";$("analyze").disabled=true;show("home");
};
function show(id){["home","results","detail"].forEach(x=>$(x).hidden=x!==id);scrollTo(0,0)}
function escapeHtml(s){return s.replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
