const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36";

const SEGUNDO = 4;
const JANELA = 15;
const NL = String.fromCharCode(10);
const CR = String.fromCharCode(13);

function instalarHls(app) {
  const tokens = new Map();
  const salas = new Map();

  function novoToken(url) {
    const token =
      Math.random().toString(36).slice(2) +
      Date.now().toString(36);

    tokens.set(token, url);
    return token;
  }

  function cabecalhos() {
    return {
      "User-Agent": UA,
      Referer: "https://www.cam4.com/"
    };
  }

  function separarLinhas(texto) {
    return String(texto).split(NL).map(function (linha) {
      return linha.replaceAll(CR, "");
    });
  }

  function juntarLinhas(linhas) {
    return linhas.join(NL);
  }

  function extrairPts(buffer) {
    for (let i = 0; i + 188 <= buffer.length; i += 188) {
      if (buffer[i] !== 0x47) {
        continue;
      }

      const inicioPacote = (buffer[i + 1] & 0x40) !== 0;

      if (!inicioPacote) {
        continue;
      }

      const ajuste = (buffer[i + 3] >> 4) & 3;

      if (ajuste === 0 || ajuste === 2) {
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

      const fluxo = buffer[p + 3];

      if (fluxo < 0xE0 || fluxo > 0xEF) {
        continue;
      }

      if ((buffer[p + 7] & 0x80) === 0) {
        continue;
      }

      const a = buffer[p + 9];
      const b = buffer[p + 10];
      const c = buffer[p + 11];
      const d = buffer[p + 12];
      const e = buffer[p + 13];

      return (
        ((a >> 1) & 7) * 1073741824 +
        b * 4194304 +
        ((c >> 1) & 127) * 32768 +
        d * 128 +
        ((e >> 1) & 127)
      );
    }

    return null;
  }

  async function obterTexto(url) {
    const resposta = await fetch(url, {
      headers: cabecalhos(),
      signal: AbortSignal.timeout(30000)
    });

    if (!resposta.ok) {
      throw new Error(
        "HTTP " + resposta.status + " em playlist"
      );
    }

    return resposta.text();
  }

  function absoluta(base, destino) {
    return new URL(destino, base).toString();
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

  function trocarUri(linha, base, usuario) {
    const partes = linha.split('URI="');

    if (partes.length < 2) {
      return linha;
    }

    const resto = partes[1];
    const fim = resto.indexOf('"');

    if (fim < 0) {
      return linha;
    }

    const original = resto.slice(0, fim);
    const token = novoToken(absoluta(base, original));

    return (
      partes[0] +
      'URI="' +
      endereco(usuario, "asset", token) +
      '"' +
      resto.slice(fim + 1)
    );
  }

  function linhaVariante(linha, base, usuario) {
    const token = novoToken(absoluta(base, linha));
    return endereco(usuario, "variant", token);
  }

  function linhaRecurso(linha, base, usuario) {
    const token = novoToken(absoluta(base, linha));
    return endereco(usuario, "asset", token);
  }

  function reescreverMaster(texto, base, usuario) {
    const linhas = separarLinhas(texto);
    const saida = [];
    let incluiuChat = false;

    for (const linha of linhas) {
      if (linha.startsWith("#EXT-X-MEDIA:")) {
        if (linha.indexOf("TYPE=SUBTITLES") >= 0) {
          continue;
        }

        saida.push(trocarUri(linha, base, usuario));
        continue;
      }

      if (linha.startsWith("#EXT-X-STREAM-INF:")) {
        let nova = linha;
        const marcador = 'SUBTITLES="';
        const posicao = nova.indexOf(marcador);

        if (posicao >= 0) {
          const inicioValor = posicao + marcador.length;
          const fimValor = nova.indexOf('"', inicioValor);

          if (fimValor >= 0) {
            nova =
              nova.slice(0, inicioValor) +
              "chat" +
              nova.slice(fimValor);
          }
        } else {
          nova += ',SUBTITLES="chat"';
        }

        saida.push(nova);
        continue;
      }

      if (linha !== "" && linha.charAt(0) !== "#") {
        saida.push(
          linhaVariante(linha, base, usuario)
        );

        continue;
      }

      saida.push(linha);

      if (!incluiuChat && linha === "#EXTM3U") {
        saida.push(
          '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="chat",NAME="Chat (Brasil)",DEFAULT=YES,AUTOSELECT=YES,FORCED=NO,LANGUAGE="pt-BR",URI="chat.m3u8"'
        );

        incluiuChat = true;
      }
    }

    if (!incluiuChat) {
      throw new Error(
        "Playlist sem cabeçalho EXTM3U."
      );
    }

    return juntarLinhas(saida) + NL;
  }

  function reescreverVariante(texto, base, usuario) {
    const linhas = separarLinhas(texto);
    const saida = [];

    for (const linha of linhas) {
      if (linha.indexOf('URI="') >= 0) {
        saida.push(
          trocarUri(linha, base, usuario)
        );

        continue;
      }

      if (linha !== "" && linha.charAt(0) !== "#") {
        saida.push(
          linhaRecurso(linha, base, usuario)
        );

        continue;
      }

      saida.push(linha);
    }

    return juntarLinhas(saida) + NL;
  }

  function estado(usuario) {
    const chave = usuario.toLowerCase();
    let s = salas.get(chave);

    if (!s) {
      s = {
        usuario: chave,
        criadoEm: Date.now(),
        pts: null
      };

      salas.set(chave, s);
    }

    return s;
  }

  function escaparTexto(texto) {
    return String(texto)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll(CR, " ")
      .replaceAll(NL, " ");
  }

  app.get(
    "/hls/:usuario/master.m3u8",
    async function (req, res) {
      try {
        const usuario = String(req.params.usuario);

        const info = await fetch(
          "https://www.cam4.com/rest/v1.0/profile/" +
          encodeURIComponent(usuario) +
          "/streamInfo",
          {
            headers: cabecalhos(),
            signal: AbortSignal.timeout(30000)
          }
        );

        if (!info.ok) {
          throw new Error(
            "HTTP " + info.status + " em streamInfo"
          );
        }

        const dados = await info.json();

        if (
          typeof dados.cdnURL !== "string" ||
          dados.cdnURL === ""
        ) {
          throw new Error(
            "Transmissão sem HLS disponível."
          );
        }

        const original = dados.cdnURL;
        const texto = await obterTexto(original);
        let resultado;

        if (texto.indexOf("#EXT-X-STREAM-INF") >= 0) {
          resultado = reescreverMaster(
            texto,
            original,
            usuario
          );
        } else {
          const token = novoToken(original);

          resultado = juntarLinhas([
            "#EXTM3U",
            '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="chat",NAME="Chat (Brasil)",DEFAULT=YES,AUTOSELECT=YES,FORCED=NO,LANGUAGE="pt-BR",URI="chat.m3u8"',
            '#EXT-X-STREAM-INF:BANDWIDTH=1000000,SUBTITLES="chat"',
            endereco(usuario, "variant", token),
            ""
          ]);
        }

        res.setHeader(
          "Content-Type",
          "application/vnd.apple.mpegurl"
        );

        res.setHeader(
          "Cache-Control",
          "no-store"
        );

        res.send(resultado);
      } catch (erro) {
        console.error(
          "[hls] master:",
          erro.message
        );

        if (!res.headersSent) {
          res.status(502).send("Falha no HLS");
        }
      }
    }
  );

  app.get(
    "/hls/:usuario/variant/:token",
    async function (req, res) {
      try {
        const usuario = String(req.params.usuario);

        const url = tokens.get(
          String(req.params.token)
        );

        if (!url) {
          return res.status(404).send(
            "Playlist expirada"
          );
        }

        const texto = await obterTexto(url);

        res.setHeader(
          "Content-Type",
          "application/vnd.apple.mpegurl"
        );

        res.setHeader(
          "Cache-Control",
          "no-store"
        );

        res.send(
          reescreverVariante(
            texto,
            url,
            usuario
          )
        );
      } catch (erro) {
        console.error(
          "[hls] variante:",
          erro.message
        );

        if (!res.headersSent) {
          res.status(502).send("Falha no HLS");
        }
      }
    }
  );

  app.get(
    "/hls/:usuario/asset/:token",
    async function (req, res) {
      try {
        const url = tokens.get(
          String(req.params.token)
        );

        if (!url) {
          return res.status(404).send(
            "Recurso expirado"
          );
        }

        const resposta = await fetch(url, {
          headers: cabecalhos(),
          signal: AbortSignal.timeout(30000)
        });

        if (!resposta.ok || !resposta.body) {
          throw new Error(
            "HTTP " + resposta.status
          );
        }

        const conteudo = Buffer.from(
          await resposta.arrayBuffer()
        );

        const pts = extrairPts(conteudo);

        if (pts !== null) {
          estado(
            String(req.params.usuario)
          ).pts = pts;
        }

        const tipo = resposta.headers.get(
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
        console.error(
          "[hls] recurso:",
          erro.message
        );

        if (!res.headersSent) {
          res.status(502).send("Falha no HLS");
        }
      }
    }
  );

  app.get(
    "/hls/:usuario/chat.m3u8",
    async function (req, res) {
      const usuario = String(req.params.usuario);
      const s = estado(usuario);
      const duracaoMs = SEGUNDO * 1000;

      // Aguarda o primeiro intervalo terminar.
      const espera =
        s.criadoEm + duracaoMs + 200 - Date.now();

      if (espera > 0) {
        await new Promise(function (resolve) {
          setTimeout(resolve, espera);
        });
      }

      // Publica somente intervalos já encerrados.
      const ultimoConcluido =
        Math.floor(
          (Date.now() - s.criadoEm - 200) /
          duracaoMs
        ) - 1;

      const primeiro = Math.max(
        0,
        ultimoConcluido - JANELA + 1
      );

      const linhas = [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        "#EXT-X-TARGETDURATION:" + SEGUNDO,
        "#EXT-X-MEDIA-SEQUENCE:" + primeiro
      ];

      for (
        let i = primeiro;
        i <= ultimoConcluido;
        i++
      ) {
        linhas.push(
          "#EXTINF:" + SEGUNDO + ".000,"
        );

        linhas.push(
          endereco(usuario, "chat", i) + ".vtt"
        );
      }

      res.setHeader(
        "Content-Type",
        "application/vnd.apple.mpegurl"
      );

      res.setHeader(
        "Cache-Control",
        "no-store"
      );

      res.send(
        juntarLinhas(linhas) + NL
      );
    }
  );

  app.get(
    "/hls/:usuario/chat/:indice.vtt",
    function (req, res) {
      const usuario = String(req.params.usuario);
      const indice = Number(req.params.indice);

      if (
        !Number.isInteger(indice) ||
        indice < 0
      ) {
        return res.status(400).send(
          "Segmento inválido"
        );
      }

      const s = estado(usuario);

      const inicio =
        s.criadoEm +
        indice * SEGUNDO * 1000;

      const fim =
        inicio + SEGUNDO * 1000;

      const loja =
        globalThis.cam4Chat || {
          salas: new Map()
        };

      const fila =
        loja.salas.get(
          usuario.toLowerCase()
        ) || [];

      const textos = fila
        .filter(function (mensagem) {
          return (
            mensagem.tempo >= inicio &&
            mensagem.tempo < fim
          );
        })
        .map(function (mensagem) {
          return escaparTexto(
            mensagem.texto
          );
        });

      const linhas = [
        "WEBVTT",
        "X-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:" +
          (s.pts || 0),
        ""
      ];

      if (textos.length > 0) {
        linhas.push(
          "00:00:00.000 --> 00:00:04.000"
        );

        linhas.push(
          textos.join(" | ")
        );

        linhas.push("");
      }

      res.setHeader(
        "Content-Type",
        "text/vtt; charset=utf-8"
      );

      res.setHeader(
        "Cache-Control",
        "no-store"
      );

      res.send(
        juntarLinhas(linhas) + NL
      );
    }
  );

  const limpeza = setInterval(function () {
    for (const [usuario, s] of salas) {
      if (
        Date.now() - s.criadoEm >
        30 * 60 * 1000
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
