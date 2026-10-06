const $ = id => document.getElementById(id);

let stream = null;
let photo = null;
let detectedItems = [];

$("startCamera").onclick = async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    $("video").srcObject = stream;
    $("cameraHint").style.display = "none";
    $("takePhoto").disabled = false;
  } catch (e) {
    alert("カメラを使えません。写真を選ぶボタンを使ってください。");
  }
};

$("takePhoto").onclick = () => {
  const v = $("video"), c = $("canvas");
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  c.getContext("2d").drawImage(v, 0, 0);
  setPhoto(c.toDataURL("image/jpeg", 0.82));
  if (stream) stream.getTracks().forEach(t => t.stop());
};

$("fileInput").onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => setPhoto(r.result);
  r.readAsDataURL(f);
};

function setPhoto(src) {
  photo = src;
  $("preview").src = src;
  $("preview").style.display = "block";
  $("video").style.display = "none";
  $("analyze").disabled = false;
  $("cameraHint").style.display = "none";
}

$("analyze").onclick = async () => {
  if (!photo) return;

  show("results");
  $("resultList").innerHTML =
    '<div class="loading"><b>AIが棚の商品を解析しています…</b><br><br><small>今回はiPhone内にAIモデルをダウンロードしません。写真をAIサーバーへ送り、商品候補をまとめて判定します。</small></div>';

  try {
    const image = await resizeImage(photo, 1600, 0.76);
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "AIサーバーから応答がありませんでした。");

    detectedItems = Array.isArray(data.items) ? data.items.slice(0, 10) : [];

    if (!detectedItems.length) {
      $("resultList").innerHTML =
        '<div class="loading">商品を特定できませんでした。<br><br>商品がもう少し大きく写るように、棚に近づいて撮影してください。</div>';
      return;
    }

    $("resultList").innerHTML = detectedItems.map(itemHtml).join("");
  } catch (e) {
    console.error(e);
    $("resultList").innerHTML =
      '<div class="loading"><b>AI解析できませんでした。</b><br><br>' +
      escapeHtml(e.message || String(e)) +
      '<br><br><small>通信状態を確認して、もう一度試してください。</small></div>';
  }
};

async function resizeImage(src, maxSide, quality) {
  const img = new Image();
  img.src = src;
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });

  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.naturalWidth * scale));
  c.height = Math.max(1, Math.round(img.naturalHeight * scale));
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", quality);
}

function itemHtml(item, i) {
  const name = item.name || "商品候補";
  const brand = item.brand && item.brand !== "不明" ? item.brand : "";
  const model = item.model && item.model !== "不明" ? item.model : "";
  const confidence = item.confidence ? Math.round(Number(item.confidence) * 100) : null;
  const reason = item.reason || "";
  const q = encodeURIComponent([name, brand, model].filter(Boolean).join(" "));

  return '<article class="item">' +
    '<div class="number">' + (i + 1) + '</div>' +
    '<div><h3>' + escapeHtml(name) + '</h3>' +
    (brand ? '<p><b>メーカー：</b>' + escapeHtml(brand) + '</p>' : '') +
    (model ? '<p><b>型番・シリーズ：</b>' + escapeHtml(model) + '</p>' : '') +
    (confidence !== null ? '<p><b>AI確度：</b>' + confidence + '%</p>' : '') +
    (reason ? '<p class="muted">' + escapeHtml(reason) + '</p>' : '') +
    '<a class="source" target="_blank" rel="noopener" href="https://www.google.com/search?tbm=isch&q=' + q + '">🖼️ 画像を比較する →</a>' +
    '<a class="source" target="_blank" rel="noopener" href="https://www.google.com/search?q=' + q + '+中古+相場">🔎 中古相場を調べる →</a>' +
    '</div></article>';
}

$("back").onclick = () => show("results");

$("newSearch").onclick = () => {
  photo = null;
  detectedItems = [];
  $("preview").style.display = "none";
  $("video").style.display = "block";
  $("analyze").disabled = true;
  show("home");
};

function show(id) {
  ["home", "results", "detail"].forEach(x => $(x).hidden = x !== id);
  scrollTo(0, 0);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"
  }[c]));
}
