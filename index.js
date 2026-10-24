const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36";
const PREFIX = "cam4:";
const MAX_PAGES = 15;
const CACHE_MS = 60000;

const ORDENACOES = [
  "Em destaque",
  "Mais Espectadores",
  "Menos Espectadores",
  "Mais Novos",
  "Mais Velhos",
  "Recente"
];

const manifest = {
  id: "community.cam4.brasil",
  version: "1.1.0",
  name: "CAM4 Brasil (Homens)",
  description: "Transmissões ao vivo do CAM4 - Brasil",
  resources: ["catalog", "meta", "stream"],
  types: ["tv"],
  idPrefixes: [PREFIX],
  catalogs: [{
    type: "tv",
    id: "cam4br",
    name: "CAM4 Brasil",
    extra: [
      { name: "genre", options: ORDENACOES, isRequired: false },
      { name: "search", isRequired: false },
      { name: "skip", isRequired: false }
    ]
  }],
  behaviorHints: { adult: true }
};

const builder = new addonBuilder(manifest);

const thumb = u => `https://snapshots.xcdnpro.com/thumbnails/${u}`;

async function getJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
  return r.json();
}

// Converte campo de data/tempo em número (aceita timestamp ou string de data)
function paraTempo(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v < 1e12 ? v * 1000 : v;
  const t = Date.parse(v);
  return isNaN(t) ? null : t;
}

function pegarInicio(u) {
  const campos = ["onlineSince", "broadcastStartTime", "startTime", "broadcastStart", "created", "createdAt"];
  for (const c of campos) {
    const t = paraTempo(u[c]);
    if (t != null) return t;
  }
  return null;
}

let cache = { t: 0, data: [] };

async function listarOnline() {
  if (Date.now() - cache.t < CACHE_MS && cache.data.length) return cache.data;

  const base = "https://pt.cam4.com/directoryCams?directoryJson=true&online=true&url=true&gender=male";
  const vistos = new Map();
  let ordem = 0;

  for (let ini = 1; ini <= MAX_PAGES; ini += 5) {
    const lote = [];
    for (let p = ini; p < ini + 5 && p <= MAX_PAGES; p++) {
      lote.push(getJson(`${base}&page=${p}`).catch(e => { console.error(e.message); return null; }));
    }
    const res = await Promise.all(lote);
    let vazio = 0;

    for (const j of res) {
      const arr = j?.users || [];
      if (!arr.length) { vazio++; continue; }
      for (const u of arr) {
        const cc = String(u.countryCode || "").toLowerCase();
        if (cc === "br" && !vistos.has(u.username)) {
          vistos.set(u.username, {
            username: u.username,
            viewers: u.viewers || 0,
            title: u.statusMessage || "",
            inicio: pegarInicio(u),
            ordem: ordem++
          });
        }
      }
    }
    if (vazio === res.length) break;
  }

  const users = [...vistos.values()];
  console.log(`[catalogo] ${users.length} transmissões do Brasil`);
  cache = { t: Date.now(), data: users };
  return users;
}

function ordenar(lista, modo) {
  const l = [...lista];
  const porInicio = (a, b, dir) => {
    if (a.inicio == null && b.inicio == null) return a.ordem - b.ordem;
    if (a.inicio == null) return 1;
    if (b.inicio == null) return -1;
    return dir * (a.inicio - b.inicio);
  };
  switch (modo) {
    case "Mais Espectadores":   return l.sort((a, b) => b.viewers - a.viewers);
    case "Menos Espectadores":  return l.sort((a, b) => a.viewers - b.viewers);
    case "Mais Novos":          return l.sort((a, b) => porInicio(a, b, -1));
    case "Mais Velhos":         return l.sort((a, b) => porInicio(a, b, 1));
    case "Recente":             return l.sort((a, b) => porInicio(a, b, -1));
    case "Em destaque":
    default:                    return l.sort((a, b) => a.ordem - b.ordem);
  }
}

builder.defineCatalogHandler(async ({ extra }) => {
  try {
    let users = await listarOnline();
    if (extra?.search) {
      const q = extra.search.toLowerCase();
      users = users.filter(u => u.username.toLowerCase().includes(q));
    }
    users = ordenar(users, extra?.genre);

    const skip = parseInt(extra?.skip || 0);
    const metas = users.slice(skip, skip + 100).map(u => ({
      id: PREFIX + u.username,
      type: "tv",
      name: u.username,
      poster: thumb(u.username),
      posterShape: "landscape",
      description: `${u.viewers} espectadores. ${u.title}`
    }));
    return { metas };
  } catch (e) {
    console.error("[catalogo]", e);
    return { metas: [] };
  }
});

builder.defineMetaHandler(async ({ id }) => {
  const u = id.slice(PREFIX.length);
  return {
    meta: {
      id, type: "tv", name: u,
      poster: thumb(u), background: thumb(u),
      posterShape: "landscape",
      behaviorHints: { isLive: true }
    }
  };
});

builder.defineStreamHandler(async ({ id }) => {
  const u = id.slice(PREFIX.length);
  try {
    const d = await getJson(`https://www.cam4.com/rest/v1.0/profile/${u}/streamInfo`);
    if (!d.cdnURL) return { streams: [] };
    return {
      streams: [{
        name: "CAM4",
        title: "Ao vivo (HLS)",
        url: d.cdnURL,
        behaviorHints: {
          notWebReady: true,
          proxyHeaders: { request: { "User-Agent": UA, Referer: "https://www.cam4.com/" } }
        }
      }]
    };
  } catch (e) {
    console.error("[stream]", u, e.message);
    return { streams: [] };
  }
});

serveHTTP(builder.getInterface(), {
  port: Number(process.env.PORT) || 7000
});
