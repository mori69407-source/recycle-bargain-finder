const MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/analyze") {
      if (request.method !== "POST") {
        return Response.json({ error: "POST only" }, { status: 405, headers });
      }

      try {
        const body = await request.json();
        const image = body?.image;

        if (typeof image !== "string" || !image.startsWith("data:image/")) {
          return Response.json({ error: "画像データを受け取れませんでした。" }, { status: 400, headers });
        }

        const prompt = `あなたはリサイクルショップの商品鑑定アシスタントです。
この棚写真を見て、写真の中で別々の商品を最大10個まで特定してください。

重要:
- 同じ商品を重複して数えない。
- 写真から実際に確認できる特徴を優先する。
- メーカー名、ブランド名、シリーズ名、型番などが読める場合は書く。
- 読めない場合は推測で断定せず「不明」とする。
- 一般名しか分からない場合でも候補として出す。
- 人物、棚、背景、値札だけは商品として数えない。
- 「これは何の商品か」と「具体的に何という商品か」を区別する。
- 商品候補が複数ある場合は、最も可能性が高い候補を1つにまとめる。
- 日本の中古市場で検索しやすい日本語の商品名を使う。
- 出力は必ずJSONだけにする。Markdownや説明文は付けない。

形式:
{
  "items": [
    {
      "name": "商品名",
      "brand": "メーカー・ブランドまたは不明",
      "model": "型番・シリーズまたは不明",
      "confidence": 0.0,
      "reason": "写真からそう判断した短い理由"
    }
  ]
}`;

        const result = await env.AI.run(MODEL, {
          messages: [
            { role: "system", content: "あなたは正確な商品画像分析アシスタントです。" },
            { role: "user", content: prompt }
          ],
          image,
          max_tokens: 1400,
          temperature: 0.1
        });

        const raw = result?.response || result?.result || result;
        const text = typeof raw === "string" ? raw : JSON.stringify(raw);
        const match = text.match(/\{[\s\S]*\}/);

        if (!match) {
          return Response.json({ error: "AIから商品一覧を取得できませんでした。" }, { status: 502, headers });
        }

        let parsed;
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          return Response.json({ error: "AIの結果を読み取れませんでした。" }, { status: 502, headers });
        }

        const items = Array.isArray(parsed.items) ? parsed.items.slice(0, 10).map(x => ({
          name: String(x.name || "商品候補"),
          brand: String(x.brand || "不明"),
          model: String(x.model || "不明"),
          confidence: Math.max(0, Math.min(1, Number(x.confidence) || 0)),
          reason: String(x.reason || "")
        })) : [];

        return Response.json({ items }, { headers });
      } catch (e) {
        return Response.json({
          error: "AI解析中にエラーが発生しました。少し待ってからもう一度お試しください。",
          detail: String(e?.message || e)
        }, { status: 500, headers });
      }
    }

    return env.ASSETS.fetch(request);
  }
};
