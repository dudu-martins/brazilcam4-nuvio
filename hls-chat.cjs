const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36";

const SEGUNDO = 4;
const JANELA = 15;
const NL = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const VOLTA_PTS = 8589934592;

function instalarHls(app) {
  const tokens = new Map();
  const porUrl = new Map();
  const salas = new Map();

  function cabecalhos() {
    return {
      "User-Agent": UA,
      Referer: "https://www.cam4.com/"
    };
  }

  function estado(usuario) {
    const chave = usuario.toLowerCase();
    let s = salas.get(chave);

    if (!s) {
      s = {
        usuario: chave,
        criadoEm: Date.now(),
        acesso: Date.now(),
        ptsBase: null,
        segmentos: new Map(),
        proximo: 0
      };

      salas.set(chave, s);
    }

    s.acesso = Date.now();
    return s;
  }

  function novoToken(url) {
    const antigo = porUrl.get(url);

    if (antigo && tokens.has(antigo)) {
      tokens.get(antigo).acesso = Date.now();
      return antigo;
    }

    const token = require("crypto")
      .randomBytes(12)
      .toString("hex");

    tokens.set(token, {
      url: url,
      acesso: Date.now()
    });

    porUrl.set(url, token);
    return token;
  }

  function buscarToken(token) {
    const registro = tokens.get(String(token));

    if (!registro) {
      return null;
    }

    registro.acesso = Date.now();
    return registro.url;
  }

  function linhas(texto) {
    return String(texto)
      .split(NL)
      .map(function (linha) {
        return linha.replaceAll(CR, "");
      });
  }

  function endereco(usuario, tipo, token) {
    return (
      "/hls/" +
      encodeURIComponent(usuario) +
      "/" +
      tipo +
      "/" +
      token
    );
  }

  function uri(base, destino, usuario, tipo) {
    const absoluta = new URL(
      destino,
      base
    ).toString();

    return endereco(
      usuario,
      tipo,
      novoToken(absoluta)
    );
  }

  function trocarUri(linha, base, usuario) {
    const marcador = 'URI="';
    let posicao = 0;
    let saida = "";

    while (true) {
      const inicio = linha.indexOf(
        marcador,
        posicao
      );

      if (inicio < 0) {
        return saida + linha.slice(posicao);
      }

      const valorInicio =
        inicio + marcador.length;

      const fim = linha.indexOf(
        '"',
        valorInicio
      );

      if (fim < 0) {
        return saida + linha.slice(posicao);
      }

      saida += linha.slice(
        posicao,
        valorInicio
      );

      saida += uri(
        base,
        linha.slice(valorInicio, fim),
        usuario,
        "asset"
      );

      saida += '"';
      posicao = fim + 1;
    }
  }

  function declaracaoChat() {
    return '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="chat",NAME="Chat (Brasil)",DEFAULT=YES,AUTOSELECT=YES,FORCED=NO,LANGUAGE="pt-BR",URI="chat.m3u8"';
  }

  function master(texto, base, usuario) {
    const saida = [];

    for (const linha of linhas(texto)) {
      if (linha === "#EXTM3U") {
        saida.push(
          linha,
          declaracaoChat()
        );
      } else if (
        linha.startsWith("#EXT-X-MEDIA:")
      ) {
        if (!linha.includes("TYPE=SUBTITLES")) {
          saida.push(
            trocarUri(linha, base, usuario)
          );
        }
      } else if (
        linha.startsWith("#EXT-X-STREAM-INF:")
      ) {
        const marcador = 'SUBTITLES="';
        const p = linha.indexOf(marcador);

        if (p < 0) {
          saida.push(
            linha + ',SUBTITLES="chat"'
          );
        } else {
          const inicio =
            p + marcador.length;

          const fim = linha.indexOf(
            '"',
            inicio
          );

          if (fim < 0) {
            throw new Error(
              "Atributo SUBTITLES invalido"
            );
          }

          saida.push(
            linha.slice(0, inicio) +
            "chat" +
            linha.slice(fim)
          );
        }
      } else if (
        linha &&
        !linha.startsWith("#")
      ) {
        saida.push(
          uri(base, linha, usuario, "variant")
        );
      } else if (
        linha.includes('URI="')
      ) {
        saida.push(
          trocarUri(linha, base, usuario)
        );
      } else {
        saida.push(linha);
      }
    }

    return saida.join(NL) + NL;
  }

  function variante(texto, base, usuario) {
    return linhas(texto)
      .map(function (linha) {
        if (linha.includes('URI="')) {
          return trocarUri(
            linha,
            base,
            usuario
          );
        }

        if (
          linha &&
          !linha.startsWith("#")
        ) {
          return uri(
            base,
            linha,
            usuario,
            "asset"
          );
        }

        return linha;
      })
      .join(NL) + NL;
  }

  async function obterTexto(url) {
    const r = await fetch(url, {
      headers: cabecalhos(),
      signal: AbortSignal.timeout(30000)
    });

    if (!r.ok) {
      throw new Error(
        "HTTP " + r.status + " em playlist"
      );
    }

    const texto = await r.text();

    if (
      !texto.trimStart().startsWith("#EXTM3U")
    ) {
      throw new Error(
        "Resposta nao e uma playlist HLS"
      );
    }

    return {
      texto: texto,
      base: r.url || url
    };
  }

  function extrairPts(buffer) {
    for (
      let i = 0;
      i + 188 <= buffer.length;
      i += 188
    ) {
      if (
        buffer[i] !== 0x47 ||
        !(buffer[i + 1] & 0x40)
      ) {
        continue;
      }

      const ajuste =
        (buffer[i + 3] >> 4) & 3;

      if (
        ajuste !== 1 &&
        ajuste !== 3
      ) {
        continue;
      }

      let p = i + 4;

      if (ajuste === 3) {
        p += 1 + buffer[i + 4];
      }

      if (p + 14 > i + 188) {
        continue;
      }

      if (
        buffer[p] !== 0 ||
        buffer[p + 1] !== 0 ||
        buffer[p + 2] !== 1
      ) {
        continue;
      }

      if (
        buffer[p + 3] < 0xE0 ||
        buffer[p + 3] > 0xEF
      ) {
        continue;
      }

      if (!(buffer[p + 7] & 0x80)) {
        continue;
      }

      return (
        ((buffer[p + 9] >> 1) & 7) *
          1073741824 +
        buffer[p + 10] * 4194304 +
        ((buffer[p + 11] >> 1) & 127) *
          32768 +
        buffer[p + 12] * 128 +
        ((buffer[p + 13] >> 1) & 127)
      );
    }

    return null;
  }

  function horario(segundos) {
    const h = Math.floor(
      segundos / 3600
    );

    const m = Math.floor(
      (segundos % 3600) / 60
    );

    const s = Math.floor(
      segundos % 60
    );

    return [h, m, s]
      .map(function (v) {
        return String(v).padStart(2, "0");
      })
      .join(":") + ".000";
  }

  function escapar(texto) {
    return String(texto)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll(CR, " ")
      .replaceAll(NL, " ");
  }

  function publicar(s) {
    if (s.ptsBase === null) {
      return -1;
    }

    const ultimo =
      Math.floor(
        (Date.now() - s.criadoEm - 200) /
        (SEGUNDO * 1000)
      ) - 1;

    const primeiro = Math.max(
      0,
      ultimo - JANELA + 1
    );

    const loja = globalThis.cam4Chat;

    const fila = loja
      ? (loja.salas.get(s.usuario) || [])
      : [];

    for (
      let i = Math.max(s.proximo, primeiro);
      i <= ultimo;
      i++
    ) {
      const inicio =
        s.criadoEm +
        i * SEGUNDO * 1000;

      const textos = fila
        .filter(function (m) {
          return (
            m.tempo >= inicio &&
            m.tempo <
              inicio + SEGUNDO * 1000
          );
        })
        .map(function (m) {
          return escapar(m.texto);
        });

      const partes = [
        "WEBVTT",
        "X-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:" +
          s.ptsBase,
        ""
      ];

      if (textos.length) {
        partes.push(
          horario(i * SEGUNDO) +
          " --> " +
          horario((i + 1) * SEGUNDO)
        );

        partes.push(
          textos.join(" | "),
          ""
        );
      }

      s.segmentos.set(
        i,
        partes.join(NL) + NL
      );
    }

    s.proximo = Math.max(
      s.proximo,
      ultimo + 1
    );

    for (const i of s.segmentos.keys()) {
      if (i < primeiro - JANELA) {
        s.segmentos.delete(i);
      }
    }

    return ultimo;
  }

  function falhar(res, tipo, erro) {
    console.error(
      "[hls] " + tipo + ":",
      erro.message
    );

    if (!res.headersSent) {
      res.status(502).send("Falha no HLS");
    }
  }

  function playlist(res, texto) {
    res.setHeader(
      "Content-Type",
      "application/vnd.apple.mpegurl"
    );

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    res.send(texto);
  }

  app.get(
    "/hls/:usuario/master.m3u8",
    async function (req, res) {
      try {
        const usuario =
          String(req.params.usuario);

        estado(usuario);

        const r = await fetch(
          "https://www.cam4.com/rest/v1.0/profile/" +
          encodeURIComponent(usuario) +
          "/streamInfo",
          {
            headers: cabecalhos(),
            signal:
              AbortSignal.timeout(30000)
          }
        );

        if (!r.ok) {
          throw new Error(
            "HTTP " +
            r.status +
            " em streamInfo"
          );
        }

        const dados = await r.json();

        if (
          !dados.cdnURL ||
          typeof dados.cdnURL !== "string"
        ) {
          throw new Error(
            "Transmissao sem HLS disponivel"
          );
        }

        const obtido = await obterTexto(
          dados.cdnURL
        );

        if (
          obtido.texto.includes(
            "#EXT-X-STREAM-INF:"
          )
        ) {
          playlist(
            res,
            master(
              obtido.texto,
              obtido.base,
              usuario
            )
          );
        } else {
          playlist(
            res,
            [
              "#EXTM3U",
              declaracaoChat(),
              '#EXT-X-STREAM-INF:BANDWIDTH=1000000,SUBTITLES="chat"',
              uri(
                obtido.base,
                obtido.base,
                usuario,
                "variant"
              ),
              ""
            ].join(NL)
          );
        }
      } catch (erro) {
        falhar(res, "master", erro);
      }
    }
  );

  app.get(
    "/hls/:usuario/variant/:token",
    async function (req, res) {
      try {
        const url = buscarToken(
          req.params.token
        );

        if (!url) {
          return res.status(404).send(
            "Playlist expirada"
          );
        }

        const obtido = await obterTexto(url);

        playlist(
          res,
          variante(
            obtido.texto,
            obtido.base,
            req.params.usuario
          )
        );
      } catch (erro) {
        falhar(res, "variante", erro);
      }
    }
  );

  app.get(
    "/hls/:usuario/asset/:token",
    async function (req, res) {
      try {
        const url = buscarToken(
          req.params.token
        );

        if (!url) {
          return res.status(404).send(
            "Recurso expirado"
          );
        }

        const r = await fetch(url, {
          headers: cabecalhos(),
          signal: AbortSignal.timeout(30000)
        });

        if (!r.ok) {
          throw new Error(
            "HTTP " + r.status
          );
        }

        const conteudo = Buffer.from(
          await r.arrayBuffer()
        );

        const pts = extrairPts(conteudo);

        const s = estado(
          String(req.params.usuario)
        );

        if (
          pts !== null &&
          s.ptsBase === null
        ) {
          // Aproximacao pelo download, nao
          // pelo instante real de reproducao.
          const decorrido = Math.round(
            (Date.now() - s.criadoEm) * 90
          );

          s.ptsBase =
            (
              (pts - decorrido) %
              VOLTA_PTS +
              VOLTA_PTS
            ) % VOLTA_PTS;

          console.log(
            "[hls] referencia fixa:",
            s.usuario,
            s.ptsBase
          );
        }

        const tipo = r.headers.get(
          "content-type"
        );

        if (tipo) {
          res.setHeader(
            "Content-Type",
            tipo
          );
        }

        res.setHeader(
          "Cache-Control",
          "no-store"
        );

        res.end(conteudo);
      } catch (erro) {
        falhar(res, "recurso", erro);
      }
    }
  );

  app.get(
    "/hls/:usuario/chat.m3u8",
    async function (req, res) {
      const usuario =
        String(req.params.usuario);

      const s = estado(usuario);
      const limite = Date.now() + 15000;
      let ultimo = publicar(s);

      while (
        ultimo < 0 &&
        Date.now() < limite &&
        !req.aborted
      ) {
        await new Promise(function (resolve) {
          setTimeout(resolve, 200);
        });

        ultimo = publicar(s);
      }

      if (req.aborted) {
        return;
      }

      if (ultimo < 0) {
        console.warn(
          "[hls] aguardando referencia de video:",
          usuario
        );

        return res
          .status(503)
          .set("Retry-After", "2")
          .send("Aguardando video MPEG-TS");
      }

      const primeiro = Math.max(
        0,
        ultimo - JANELA + 1
      );

      const partes = [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        "#EXT-X-TARGETDURATION:" + SEGUNDO,
        "#EXT-X-MEDIA-SEQUENCE:" + primeiro
      ];

      for (
        let i = primeiro;
        i <= ultimo;
        i++
      ) {
        partes.push(
          "#EXTINF:" + SEGUNDO + ".000,"
        );

        partes.push(
          endereco(
            usuario,
            "chat",
            i
          ) + ".vtt"
        );
      }

      playlist(
        res,
        partes.join(NL) + NL
      );
    }
  );

  app.get(
    "/hls/:usuario/chat/:indice.vtt",
    function (req, res) {
      const i = Number(
        req.params.indice
      );

      if (
        !Number.isInteger(i) ||
        i < 0
      ) {
        return res.status(400).send(
          "Indice invalido"
        );
      }

      const s = estado(
        String(req.params.usuario)
      );

      publicar(s);

      const texto =
        s.segmentos.get(i);

      if (texto === undefined) {
        return res.status(404).send(
          "Segmento indisponivel"
        );
      }

      res.setHeader(
        "Content-Type",
        "text/vtt; charset=utf-8"
      );

      res.setHeader(
        "Cache-Control",
        "no-store"
      );

      res.send(texto);
    }
  );

  const limpeza = setInterval(function () {
    const agora = Date.now();

    for (const [token, registro] of tokens) {
      if (
        agora - registro.acesso >
        30 * 60 * 1000
      ) {
        tokens.delete(token);

        if (
          porUrl.get(registro.url) === token
        ) {
          porUrl.delete(registro.url);
        }
      }
    }

    for (const [usuario, s] of salas) {
      if (
        agora - s.acesso >
        10 * 60 * 1000
      ) {
        salas.delete(usuario);
      }
    }
  }, 60000);

  limpeza.unref();
}

module.exports = {
  instalarHls: instalarHls
};
