const {
  addonBuilder,
  getRouter
} = require("stremio-addon-sdk");

const express = require("express");

const PUBLIC_URL =
  process.env.PUBLIC_URL ||
  "https://brazilcam4-nuvio.onrender.com";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36";

const PREFIX = "cam4:";
const MAX_PAGES = 15;
const CACHE_MS = 60000;

const ORDENACOES = [
  "Em destaque",
  "Mais Espectadores",
  "Menos Espectadores"
];

const manifest = {
  id: "community.cam4.brasil",
  version: "1.2.1",
  name: "CAM4 Brasil (Homens)",
  description: "Transmissões ao vivo do CAM4 - Brasil",

  resources: [
    "catalog",
    "meta",
    "stream"
  ],

  types: ["tv"],
  idPrefixes: [PREFIX],

  catalogs: [
    {
      type: "tv",
      id: "cam4br",
      name: "CAM4 Brasil",

      extra: [
        {
          name: "genre",
          options: ORDENACOES,
          isRequired: false
        },
        {
          name: "search",
          isRequired: false
        },
        {
          name: "skip",
          isRequired: false
        }
      ]
    }
  ],

  behaviorHints: {
    adult: true
  }
};

const builder = new addonBuilder(manifest);

function thumb(usuario) {
  return (
    "https://snapshots.xcdnpro.com/thumbnails/" +
    encodeURIComponent(usuario)
  );
}

async function getJson(url) {
  const resposta = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json"
    },
    signal: AbortSignal.timeout(30000)
  });

  if (!resposta.ok) {
    throw new Error(
      "HTTP " + resposta.status + " em " + url
    );
  }

  return resposta.json();
}

let cache = {
  t: 0,
  data: []
};

async function listarOnline() {
  if (
    Date.now() - cache.t < CACHE_MS &&
    cache.data.length > 0
  ) {
    return cache.data;
  }

  const base =
    "https://pt.cam4.com/directoryCams?directoryJson=true&online=true&url=true&gender=male";

  const vistos = new Map();
  let ordem = 0;

  for (
    let inicio = 1;
    inicio <= MAX_PAGES;
    inicio += 5
  ) {
    const lote = [];

    for (
      let pagina = inicio;
      pagina < inicio + 5 &&
      pagina <= MAX_PAGES;
      pagina++
    ) {
      lote.push(
        getJson(
          base + "&page=" + pagina
        ).catch(function (erro) {
          console.error(
            "[catalogo]",
            erro.message
          );

          return null;
        })
      );
    }

    const respostas = await Promise.all(lote);
    let paginasVazias = 0;

    for (const resposta of respostas) {
      const usuarios =
        Array.isArray(resposta?.users)
          ? resposta.users
          : [];

      if (usuarios.length === 0) {
        paginasVazias++;
        continue;
      }

      for (const usuario of usuarios) {
        const pais = String(
          usuario.countryCode || ""
        ).toLowerCase();

        const nome = String(
          usuario.username || ""
        ).trim();

        if (
          pais !== "br" ||
          nome === "" ||
          vistos.has(nome)
        ) {
          continue;
        }

        vistos.set(nome, {
          username: nome,
          viewers:
            Number(usuario.viewers) || 0,
          title:
            usuario.statusMessage || "",
          ordem: ordem++
        });
      }
    }

    if (
      paginasVazias === respostas.length
    ) {
      break;
    }
  }

  const usuarios = [
    ...vistos.values()
  ];

  console.log(
    "[catalogo]",
    usuarios.length,
    "transmissoes do Brasil"
  );

  cache = {
    t: Date.now(),
    data: usuarios
  };

  return usuarios;
}

function ordenar(lista, modo) {
  const resultado = [...lista];

  switch (modo) {
    case "Mais Espectadores":
      return resultado.sort(function (a, b) {
        return b.viewers - a.viewers;
      });

    case "Menos Espectadores":
      return resultado.sort(function (a, b) {
        return a.viewers - b.viewers;
      });

    case "Em destaque":
    default:
      return resultado.sort(function (a, b) {
        return a.ordem - b.ordem;
      });
  }
}

builder.defineCatalogHandler(
  async function ({ extra }) {
    try {
      let usuarios = await listarOnline();

      if (extra?.search) {
        const busca = String(
          extra.search
        ).toLowerCase();

        usuarios = usuarios.filter(
          function (usuario) {
            return usuario.username
              .toLowerCase()
              .includes(busca);
          }
        );
      }

      usuarios = ordenar(
        usuarios,
        extra?.genre
      );

      const skipInformado = parseInt(
        extra?.skip || "0",
        10
      );

      const skip =
        Number.isFinite(skipInformado) &&
        skipInformado >= 0
          ? skipInformado
          : 0;

      const metas = usuarios
        .slice(skip, skip + 100)
        .map(function (usuario) {
          return {
            id:
              PREFIX + usuario.username,
            type: "tv",
            name: usuario.username,
            poster:
              thumb(usuario.username),
            posterShape: "landscape",
            description:
              usuario.viewers +
              " espectadores. " +
              usuario.title
          };
        });

      return { metas };
    } catch (erro) {
      console.error(
        "[catalogo]",
        erro.message
      );

      return { metas: [] };
    }
  }
);

builder.defineMetaHandler(
  async function ({ id }) {
    if (
      typeof id !== "string" ||
      !id.startsWith(PREFIX)
    ) {
      return { meta: null };
    }

    const usuario = id.slice(
      PREFIX.length
    );

    return {
      meta: {
        id,
        type: "tv",
        name: usuario,
        poster: thumb(usuario),
        background: thumb(usuario),
        posterShape: "landscape",

        behaviorHints: {
          isLive: true
        }
      }
    };
  }
);

builder.defineStreamHandler(
  async function ({ id }) {
    if (
      typeof id !== "string" ||
      !id.startsWith(PREFIX)
    ) {
      return { streams: [] };
    }

    const usuario = id.slice(
      PREFIX.length
    );

    try {
      const dados = await getJson(
        "https://www.cam4.com/rest/v1.0/profile/" +
        encodeURIComponent(usuario) +
        "/streamInfo"
      );

      if (
        typeof dados.cdnURL !== "string" ||
        dados.cdnURL === ""
      ) {
        return { streams: [] };
      }

      return {
        streams: [
          {
            name: "CAM4",
            title: "Ao vivo (HLS)",
            url: dados.cdnURL,

            behaviorHints: {
              notWebReady: true,

              proxyHeaders: {
                request: {
                  "User-Agent": UA,
                  Referer:
                    "https://www.cam4.com/"
                }
              }
            }
          }
        ]
      };
    } catch (erro) {
      console.error(
        "[stream]",
        usuario,
        erro.message
      );

      return { streams: [] };
    }
  }
);

const app = express();

app.use(function (req, res, next) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(
  getRouter(
    builder.getInterface()
  )
);

const port =
  Number(process.env.PORT) || 7000;

app.listen(
  port,
  "0.0.0.0",
  function () {
    console.log(
      "Addon ouvindo na porta " + port
    );

    console.log(
      "Manifest: " +
      PUBLIC_URL +
      "/manifest.json"
    );
  }
);
