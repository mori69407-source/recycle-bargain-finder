const $=id=>document.getElementById(id);
let stream=null,photo=null,detectorPromise=null,classifierPromise=null;

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
    const classifier=await getClassifier();
    const original=await loadImage(photo);
    const img=await loadImage(await resizeForDetection(photo,960));
    const items=(await detectUpToThree(detector,img)).map(item=>({...item,box:scaleBox(item.box,original.naturalWidth/img.naturalWidth,original.naturalHeight/img.naturalHeight)}));
    if(items.length){
      for(const item of items){
        const cropUrl=cropImage(original,item.box,0.90);
        if(!cropUrl)continue;
        const cropImg=await loadImage(cropUrl);
        const ranked=await classifier(cropImg,CLASSIFY_LABELS);
        if(ranked&&ranked.length){item.finalLabel=ranked[0].label;item.score=Math.min(item.score,ranked[0].score);}
      }
    }
    if(!items.length)throw new Error("商品を検出できませんでした。商品が大きく写るように撮り直すか、明るい写真を選んでください。");
    $("resultList").innerHTML=items.map((item,i)=>{
      const crop=cropImage(original,item.box,0.90);
      const label=translateLabel(item.finalLabel||item.label);
      const query=encodeURIComponent(label+" 中古 ヴィンテージ");
      return '<article class="item"><div class="number">'+(i+1)+'</div>'+(crop?'<img class="thumb crop" src="'+crop+'" alt="検出した商品'+(i+1)+'">':'<div class="thumb"></div>')+'<div><h3>'+escapeHtml(label)+'</h3><p><b>検出の確度：</b>'+Math.round(item.score*100)+'%</p><p class="muted">これは物体の種類の推定です。ブランドや型番の特定ではありません。</p><a class="source" target="_blank" rel="noopener" href="https://www.google.com/search?tbm=isch&q='+query+'">似た商品を画像検索 ↗</a></div></article>';
    }).join("");
  }catch(e){
    console.error(e);
    $("resultList").innerHTML='<div class="loading"><b>検出できませんでした。</b><br><br>'+escapeHtml(e.message||String(e))+'<br><br><button id="retry" type="button">もう一度試す</button></div>';
    const retry=$("retry");if(retry)retry.addEventListener("click",()=>$("analyze").click());
  }finally{$("analyze").disabled=false;}
});

async function getClassifier(){
  if(!classifierPromise){
    classifierPromise=(async()=>{
      const {pipeline}=await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1");
      return await pipeline("zero-shot-image-classification","Xenova/clip-vit-base-patch32",{dtype:"q8"});
    })().catch(e=>{classifierPromise=null;throw new Error("分類モデルを読み込めませんでした。通信環境を確認して再試行してください。詳細: "+(e.message||e));});
  }
  return classifierPromise;
}
async function getDetector(){
  if(!detectorPromise){
    detectorPromise=(async()=>{
      const {pipeline,env}=await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1");
      env.allowLocalModels=false;
      return await pipeline("zero-shot-object-detection","Xenova/owlvit-base-patch32",{dtype:"q8"});
    })().catch(e=>{detectorPromise=null;throw new Error("AIモデルを読み込めませんでした。通信環境を確認して、もう一度お試しください。詳細: "+(e.message||e));});
  }
  return detectorPromise;
}
const CANDIDATE_LABELS=[
  "plush toy","stuffed animal","toy figure","figurine","doll",
  "ceramic plate","plate","bowl","cup","mug","glass","vase",
  "book","small box","ornament","decorative object","clock",
  "camera","remote control","television remote control","headphones","speaker",
  "laptop computer","notebook computer","computer","toothbrush","electric toothbrush",
  "power adapter","video game controller","handheld game console","game cartridge",
  "shoe","bag","clothing","kitchen utensil","household object"
];
const CLASSIFY_LABELS=[
  "remote control for a television","laptop computer with a keyboard and screen","toothbrush with bristles and a long handle",
  "wallet for carrying cards and money","video game disc or game software case","handheld game console","video game controller",
  "mobile phone","plush stuffed animal","doll or toy figure","ceramic plate","bowl","cup or mug","drinking glass","vase",
  "book or notebook","camera","power adapter or charger","shoe","bag","figurine","clock","headphones","speaker","cable","household item"
];
async function detectUpToThree(detector,img){
  const W=img.naturalWidth,H=img.naturalHeight;
  const canvas=document.createElement("canvas");canvas.width=W;canvas.height=H;
  canvas.getContext("2d").drawImage(img,0,0);
  let found=await detector(canvas,CANDIDATE_LABELS,{threshold:0.12,top_k:20});
  found=selectItems(found);
  if(found.length>=3)return found.slice(0,3);
  const tileW=Math.ceil(W*0.58), starts=[0,Math.round((W-tileW)/2),Math.max(0,W-tileW)];
  for(const left of starts){
    const tile=document.createElement("canvas");tile.width=tileW;tile.height=H;
    tile.getContext("2d").drawImage(img,left,0,tileW,H,0,0,tileW,H);
    const output=await detector(tile,CANDIDATE_LABELS,{threshold:0.10,top_k:20});
    for(const item of (output||[])){
      if(!item.box)continue;
      const b=item.box;
      found.push({...item,box:{xmin:b.xmin+left,xmax:b.xmax+left,ymin:b.ymin,ymax:b.ymax}});
    }
  }
  return selectItems(found).slice(0,3);
}
function scaleBox(b,sx,sy){return {xmin:b.xmin*sx,xmax:b.xmax*sx,ymin:b.ymin*sy,ymax:b.ymax*sy};}
function selectItems(output){
  const seen=[];
  for(const x of (output||[]).sort((a,b)=>b.score-a.score)){
    if(!x.box||x.score<0.10)continue;
    const b=x.box,w=b.xmax-b.xmin,h=b.ymax-b.ymin;
    if(w<24||h<24)continue;
    const duplicate=seen.some(y=>intersectionOverUnion(y.box,b)>0.40);
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
function cropImage(img,b,padRatio=0.42){
  const bw=Math.max(1,b.xmax-b.xmin),bh=Math.max(1,b.ymax-b.ymin);
  const x=Math.max(0,Math.floor(b.xmin-bw*padRatio)),y=Math.max(0,Math.floor(b.ymin-bh*padRatio));
  const right=Math.min(img.naturalWidth,Math.ceil(b.xmax+bw*padRatio));
  const bottom=Math.min(img.naturalHeight,Math.ceil(b.ymax+bh*padRatio));
  const w=right-x,h=bottom-y;
  if(w<2||h<2)return "";
  const c=document.createElement("canvas"),scale=Math.min(1,480/Math.max(w,h));
  c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));
  c.getContext("2d").drawImage(img,x,y,w,h,0,0,c.width,c.height);
  return c.toDataURL("image/jpeg",0.84);
}
function translateLabel(s){
  const names={"power adapter":"電源アダプター","AC adapter":"ACアダプター","phone charger":"充電器","mobile phone":"携帯電話","smartphone":"スマートフォン","video game console":"ゲーム機","video game controller":"ゲームコントローラー","handheld game console":"携帯ゲーム機","game cartridge":"ゲームソフト","electronic device":"電子機器","electrical plug":"電源プラグ","cable":"ケーブル","plush toy":"ぬいぐるみ","stuffed animal":"ぬいぐるみ","ceramic plate":"陶器の皿","plate":"皿","bowl":"器・ボウル","cup":"カップ","mug":"マグカップ","vase":"花瓶","figurine":"置物・フィギュア","toy":"おもちゃ","book":"本","camera":"カメラ","remote control":"リモコン","television remote control":"リモコン","laptop computer":"ノートパソコン","notebook computer":"ノートパソコン","computer":"パソコン","toothbrush":"歯ブラシ","electric toothbrush":"電動歯ブラシ","remote control for a television":"リモコン","laptop computer with a keyboard and screen":"ノートパソコン","toothbrush with bristles and a long handle":"歯ブラシ","wallet for carrying cards and money":"財布","video game disc or game software case":"ゲームソフト","handheld game console":"携帯ゲーム機","video game controller":"ゲームコントローラー","mobile phone":"携帯電話","a plush toy":"ぬいぐるみ","a stuffed animal":"ぬいぐるみ","a ceramic plate":"陶器の皿","a bowl":"器・ボウル","a cup":"カップ","a mug":"マグカップ","a glass":"グラス","a vase":"花瓶","a book":"本","a camera":"カメラ","a power adapter":"電源アダプター","a game controller":"ゲームコントローラー","a handheld game console":"携帯ゲーム機","a shoe":"靴","a bag":"バッグ","a figurine":"フィギュア","a doll":"人形","a clock":"時計","a pair of headphones":"ヘッドホン","a speaker":"スピーカー","a cable":"ケーブル","a household object":"日用品","headphones":"ヘッドホン","speaker":"スピーカー","clock":"時計","ornament":"装飾品","glass":"グラス"};
  return names[s]||s;
}
$("newSearch").addEventListener("click",()=>{photo=null;$("preview").style.display="none";$("video").style.display="block";$("analyze").disabled=true;$("fileInput").value="";show("home");});
$("back").addEventListener("click",()=>show("home"));
function show(id){["home","results","detail"].forEach(x=>$(x).hidden=x!==id);window.scrollTo(0,0);}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
