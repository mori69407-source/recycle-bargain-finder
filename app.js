const $=id=>document.getElementById(id);
let stream=null,photo=null,detectedItems=[];
$("startCamera").onclick=async()=>{try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});$("video").srcObject=stream;$("cameraHint").style.display="none";$("takePhoto").disabled=false}catch(e){alert("カメラを使えません。写真を選ぶボタンを使ってください。")}};
$("takePhoto").onclick=()=>{const v=$("video"),c=$("canvas");if(!v.videoWidth)return; c.width=v.videoWidth;c.height=v.videoHeight;c.getContext("2d").drawImage(v,0,0);setPhoto(c.toDataURL("image/jpeg",.8));if(stream)stream.getTracks().forEach(t=>t.stop())};
$("fileInput").onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>setPhoto(r.result);r.readAsDataURL(f)};
function setPhoto(src){photo=src;$("preview").src=src;$("preview").style.display="block";$("video").style.display="none";$("analyze").disabled=false;$("cameraHint").style.display="none"}
$("analyze").onclick=async()=>{if(!photo)return;show("results");$("resultList").innerHTML='<div class="loading"><b>AI解析中です…</b><br><br>商品1個だけを認識するテストです。初回はAIの起動に時間がかかることがあります。</div>';try{const text=await askVision(await resizeImage(photo,1100,.72));const item=parseOne(text);if(!item)throw Error("AIは商品を特定できませんでした。商品を大きく写した写真で試してください。");detectedItems=[item];$("resultList").innerHTML=itemHtml(item)}catch(e){console.error(e);$("resultList").innerHTML='<div class="loading"><b>AI解析できませんでした。</b><br><br>'+escapeHtml(e.message||String(e))+'</div>'}};
async function askVision(dataUrl){
 const {Client,handle_file}=await import("https://cdn.jsdelivr.net/npm/@gradio/client@1.15.0/dist/index.min.js");
 let status="";
 const app=await Client.connect("developer0hye/Qwen2.5-VL-7B-Instruct",{status_callback:s=>{status=s&&s.status||""}});
 const api=await app.view_api();
 const endpoint=api.named_endpoints&&api.named_endpoints["/qwen_vl_inference"];
 if(!endpoint)throw Error("AI側の解析入口が見つかりませんでした。");
 const blob=dataUrlToBlob(dataUrl);
 const prompt='この画像に写っている「商品」を1個だけ認識してください。背景や棚は無視してください。日本語で、商品名、メーカー/ブランド（分かれば）、型番/シリーズ（分かれば）、そう判断した理由を短く返してください。分からない情報は「不明」としてください。JSONだけを返してください。形式: {"name":"商品名","brand":"不明","model":"不明","confidence":0.0,"reason":"理由"}';
 let result;
 try{result=await app.predict("/qwen_vl_inference",[handle_file(blob),prompt])}catch(e){throw Error("AI解析に失敗しました。AIが起動中または混雑中の可能性があります。もう一度お試しください。")}
 const data=result&&result.data;
 if(!data)throw Error("AIから結果が返りませんでした。");
 return Array.isArray(data)?String(data[0]||""):String(data);
}
function parseOne(text){const clean=String(text).replace(/\`\`\`json|\`\`\`/g,"");const m=clean.match(/\{[\s\S]*\}/);if(!m)return null;try{const x=JSON.parse(m[0]);if(!x.name)return null;return{name:String(x.name),brand:String(x.brand||"不明"),model:String(x.model||"不明"),confidence:clamp(Number(x.confidence)||0,0,1),reason:String(x.reason||"")}}catch{return null}}
function itemHtml(x){return '<article class="item"><div class="number">1</div><div><h3>'+escapeHtml(x.name)+'</h3>'+(x.brand!=="不明"?'<p><b>メーカー：</b>'+escapeHtml(x.brand)+'</p>':'')+(x.model!=="不明"?'<p><b>型番・シリーズ：</b>'+escapeHtml(x.model)+'</p>':'')+'<p><b>AI確度：</b>'+Math.round(x.confidence*100)+'%</p>'+(x.reason?'<p class="muted">'+escapeHtml(x.reason)+'</p>':'')+'</div></article>'}
$("newSearch").onclick=()=>{photo=null;detectedItems=[];$("preview").style.display="none";$("video").style.display="block";$("analyze").disabled=true;show("home")};
$("back").onclick=()=>show("home");
function dataUrlToBlob(s){const[a,b]=s.split(","),mime=(a.match(/data:([^;]+)/)||[,"image/jpeg"])[1],bytes=atob(b),arr=new Uint8Array(bytes.length);for(let i=0;i<bytes.length;i++)arr[i]=bytes.charCodeAt(i);return new Blob([arr],{type:mime})}
async function resizeImage(src,max,q){const img=new Image();img.src=src;await new Promise((r,j)=>{img.onload=r;img.onerror=j});const sc=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight)),c=document.createElement("canvas");c.width=Math.round(img.naturalWidth*sc);c.height=Math.round(img.naturalHeight*sc);c.getContext("2d").drawImage(img,0,0,c.width,c.height);return c.toDataURL("image/jpeg",q)}
function show(id){["home","results","detail"].forEach(x=>$(x).hidden=x!==id);scrollTo(0,0)}
function clamp(n,a,b){return Math.max(a,Math.min(b,n))}
function escapeHtml(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}