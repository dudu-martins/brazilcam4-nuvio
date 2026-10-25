const { initializeApp, deleteApp } = require("firebase/app");

const {
  initializeAuth,
  inMemoryPersistence,
  signInWithCustomToken,
  signOut
} = require("firebase/auth");

const {
  getDatabase,
  ref,
  onValue,
  goOffline
} = require("firebase/database");

const NL = String.fromCharCode(10);

function instalarChat(app) {
  const salas = new Map();
  const MAX_SALAS = 3;
  const OCIOSO_MS = 120000;

  function nomeValido(nome) {
    if (typeof nome !== "string" || nome.length < 1 || nome.length > 100) {
      return false;
    }

    const proibidos = ["/", "?", "#", ".", "$", "[", "]"];

    return !proibidos.some(function (caractere) {
      return nome.indexOf(caractere) >= 0;
    });
  }

  async function limpar(s) {
    if (s.limpando) {
      return;
    }

    s.limpando = true;

    if (s.cancelar) {
      s.cancelar();
    }

    if (s.db) {
      goOffline(s.db);
    }

    if (s.auth) {
      await signOut(s.auth).catch(function () {});
    }

    if (s.firebase) {
      await deleteApp(s.firebase).catch(function () {});
    }

    if (salas.get(s.chave) === s) {
      salas.delete(s.chave);
    }

    console.log("[chat] Encerrado:", s.nome);
  }

  async function conectar(s) {
    try {
      const url = new URL(
        "https://api.cam4.com/webchat/requestAccess"
      );

      url.searchParams.set(
        "r",
        String(Math.floor(Math.random() * 100000000) + 1)
      );

      url.searchParams.set("roomname", s.nome);
      url.searchParams.set("chat_history_limit", "1");

      const resposta = await fetch(url, {
        headers: {
          Accept: "application/json"
        },
        signal: AbortSignal.timeout(30000)
      });

      if (!resposta.ok) {
        throw new Error("HTTP " + resposta.status);
      }

      const dados = await resposta.json();

      if (dados.status !== "success") {
        throw new Error(
          "Acesso recusado: " + String(dados.status)
        );
      }

      if (
        dados.privateRoom === true ||
        dados.privateStream === true
      ) {
        throw new Error(
          "Este teste aceita apenas salas públicas."
        );
      }

      let config = dados.firebase_app_config;

      if (typeof config === "string") {
        config = JSON.parse(config);
      }

      if (
        !config ||
        typeof dados.firebase_token_v2 !== "string" ||
        typeof dados.shard !== "string"
      ) {
        throw new Error(
          "A resposta não contém a configuração esperada."
        );
      }

      const endereco = new URL(dados.shard);

      if (endereco.protocol !== "https:") {
        throw new Error(
          "O endereço do banco não está no formato HTTPS esperado."
        );
      }

      s.firebase = initializeApp(
        config,
        "chat-" + Date.now() + "-" +
          Math.random().toString(36).slice(2)
      );

      s.auth = initializeAuth(s.firebase, {
        persistence: inMemoryPersistence
      });

      await signInWithCustomToken(
        s.auth,
        dados.firebase_token_v2
      );

      s.db = getDatabase(s.firebase, endereco.toString());
      s.estado = "conectado";

      console.log("[chat] Conectado:", s.nome);

      s.cancelar = onValue(
        ref(s.db, "c/" + s.chave),
        function (snapshot) {
          const valor = snapshot.val();

          if (!valor || typeof valor !== "object") {
            return;
          }

          const assinatura = JSON.stringify(valor);

          if (assinatura === s.ultimo) {
            return;
          }

          s.ultimo = assinatura;

          if (Object.hasOwn(valor, "delete")) {
            return;
          }

          if (
            typeof valor.m !== "string" ||
            valor.m.trim() === ""
          ) {
            return;
          }

          const texto = valor.m
            .replaceAll(String.fromCharCode(13), " ")
            .replaceAll(String.fromCharCode(10), " ")
            .slice(0, 2000);

          const partesAutor =
            typeof valor.p === "string"
              ? valor.p.split("$")
              : [];

          const nomeAutor =
            partesAutor.length >= 2
              ? partesAutor[1].trim()
              : "";

          const autor =
            nomeAutor !== ""
              ? nomeAutor
              : "Visitante";

          if (!s.camposRegistrados) {
           console.log(
             "[chat] campos recebidos:",
             Object.keys(valor).join(", ")
           );

           const p = valor.p;

           console.log("[chat] diagnóstico de p:", {
             tipo: p === null ? "null" : typeof p,
             array: Array.isArray(p),
             tamanho: typeof p === "string" ? p.length : undefined,
             campos:
               p !== null && typeof p === "object"
                 ? Object.keys(p)
                 : []
           });

           s.camposRegistrados = true;
          }

          const loja =
            globalThis.cam4Chat =
            globalThis.cam4Chat || { salas: new Map() };

          const fila =
            loja.salas.get(s.chave) || [];

          fila.push({
            tempo: Date.now(),
            texto: autor + ": " + texto
          });

          loja.salas.set(s.chave, fila.slice(-50));

          s.mensagens.push({
            id: ++s.sequencia,
            recebidoEm: Date.now(),
            texto: autor + ": " + texto
          });

          s.mensagens = s.mensagens.slice(-100);

          console.log(
            "[chat] Mensagem recebida:",
            s.nome
          );
        },
        function (erro) {
          s.estado = "erro";
          s.erro =
            "Leitura interrompida: " +
            (erro.code || "sem código");

          if (s.db) {
            goOffline(s.db);
          }
        }
      );
    } catch (erro) {
      s.estado = "erro";
      s.erro =
        erro.code ||
        erro.message ||
        "Falha na conexão";

      if (s.db) {
        goOffline(s.db);
      }

      console.error("[chat]", s.nome, s.erro);
    }
  }

  function obter(nome) {
    const chave = nome.toLowerCase();
    let s = salas.get(chave);

    if (!s) {
      if (salas.size >= MAX_SALAS) {
        throw new Error(
          "Limite de três salas. Feche os testes e aguarde dois minutos."
        );
      }

      s = {
        nome: nome,
        chave: chave,
        estado: "conectando",
        erro: null,
        mensagens: [],
        sequencia: 0,
        ultimo: null,
        acesso: Date.now(),
        limpando: false,
        iniciando: null,
        camposRegistrados: false
      };

      salas.set(chave, s);
      s.iniciando = conectar(s);
    }

    s.acesso = Date.now();
    return s;
  }

  app.use("/hls/:usuario", function (req, res, next) {
    const nome = String(req.params.usuario || "")
      .trim()
      .toLowerCase();

    if (!nomeValido(nome)) {
      return next();
    }

    try {
      obter(nome);
    } catch (erro) {
      console.error(
        "[chat] Não foi possível acompanhar:",
        nome,
        erro.message
      );
    }

    next();
  });

  app.get("/chat-live/:usuario.json", function (req, res) {
    res.setHeader("Cache-Control", "no-store");

    const nome = req.params.usuario;

    if (!nomeValido(nome)) {
      return res.status(400).json({
        erro: "Nome inválido."
      });
    }

    try {
      const s = obter(nome);

      res.json({
        sala: s.nome,
        estado: s.estado,
        erro: s.erro,
        mensagens: s.mensagens
      });
    } catch (erro) {
      res.status(429).json({
        erro: erro.message
      });
    }
  });

  app.get("/chat-live", function (req, res) {
    res.setHeader("Cache-Control", "no-store");

    res.type("html").send(
      '<!doctype html>' + NL +
      '<html lang="pt-BR">' + NL +
      '<meta charset="utf-8">' + NL +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' + NL +
      '<title>Teste do chat CAM4</title>' + NL +
      '<style>' + NL +
      'body{background:#151515;color:#eee;font:17px system-ui;padding:16px}' + NL +
      'input,button{font:inherit;padding:10px;max-width:90%}' + NL +
      'li{margin:12px 0;overflow-wrap:anywhere}' + NL +
      '#estado{color:#9ddcff}' + NL +
      '</style>' + NL +
      '<h1>Chat real: teste local</h1>' + NL +
      '<p>Somente salas públicas.</p>' + NL +
      '<form id="form">' + NL +
      '<input id="sala" placeholder="Nome da câmera" required>' + NL +
      '<button>Acompanhar</button>' + NL +
      '</form>' + NL +
      '<p id="estado">Informe uma sala pública online.</p>' + NL +
      '<ol id="mensagens"></ol>' + NL +
      '<script>' + NL +
      'let geracao=0;' + NL +
      'const estado=document.getElementById("estado");' + NL +
      'const lista=document.getElementById("mensagens");' + NL +
      'document.getElementById("form").addEventListener("submit",async function(e){' + NL +
      'e.preventDefault();const atual=++geracao;const sala=document.getElementById("sala").value.trim();lista.replaceChildren();' + NL +
      'async function atualizar(){if(atual!==geracao)return;try{const r=await fetch("/chat-live/"+encodeURIComponent(sala)+".json",{cache:"no-store"});const d=await r.json();if(atual!==geracao)return;if(!r.ok)throw new Error(d.erro||("HTTP "+r.status));estado.textContent=d.estado+(d.erro?" - "+d.erro:"");lista.replaceChildren();for(const m of d.mensagens){const li=document.createElement("li");li.textContent=new Date(m.recebidoEm).toLocaleTimeString()+" - "+m.texto;lista.appendChild(li);}if(d.estado==="erro")return;}catch(err){if(atual===geracao)estado.textContent=String(err);return;}if(atual===geracao)setTimeout(atualizar,2000);}' + NL +
      'await atualizar();});' + NL +
      '</script>' + NL +
      '</html>'
    );
  });

  const limpeza = setInterval(function () {
    for (const s of salas.values()) {
      if (
        Date.now() - s.acesso > OCIOSO_MS &&
        !s.limpando
      ) {
        void s.iniciando.finally(function () {
          return limpar(s);
        });
      }
    }
  }, 15000);

  limpeza.unref();

  let saindo = false;

  async function parar() {
    if (saindo) {
      return;
    }

    saindo = true;
    clearInterval(limpeza);

    const limite = setTimeout(function () {
      process.exit(0);
    }, 5000);

    limite.unref();

    const tarefas = [];

    for (const s of salas.values()) {
      tarefas.push(
        s.iniciando.finally(function () {
          return limpar(s);
        })
      );
    }

    await Promise.all(tarefas);
    process.exit(0);
  }

  process.once("SIGINT", parar);
  process.once("SIGTERM", parar);
}

module.exports = {
  instalarChat: instalarChat
};
