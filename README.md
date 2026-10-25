<div align="center">

# 📺 CAM4 Brasil
### Addon para Stremio · Câmeras masculinas do Brasil

Transmissões ao vivo, navegação simples e ordenação por espectadores.

🇧🇷 Brasil · 🔴 Ao vivo · 🔎 Busca por nome · 🎛️ Três ordenações

---

### 🔞 Conteúdo destinado exclusivamente a maiores de 18 anos

</div>

## ✨ Sobre o projeto

O CAM4 Brasil é um addon comunitário para o Stremio que reúne câmeras masculinas identificadas como brasileiras no diretório do CAM4.

A proposta é simples: encontrar uma câmera, escolher uma transmissão e assistir — sem cadastro de contas no addon e sem configuração de chat.

Esta versão mantém o foco no catálogo e na reprodução, sem captura de mensagens, legendas de chat ou proxy HLS próprio.

## 🎯 Recursos

- 🇧🇷 Catálogo filtrado por país: Brasil.
- 📺 Câmeras masculinas ao vivo.
- 🖼️ Miniaturas das transmissões.
- 🔎 Busca pelo nome da câmera.
- 👥 Quantidade de espectadores na descrição.
- 📄 Paginação do catálogo.
- ⚡ Cache local do catálogo por 60 segundos.
- 🎛️ Três opções de ordenação.

## 🎛️ Ordenações disponíveis

| Opção | Como funciona |
| :--- | :--- |
| ⭐ Em destaque | Preserva a ordem em que as câmeras foram encontradas no diretório consultado. |
| 📈 Mais Espectadores | Exibe primeiro as câmeras com mais espectadores. |
| 📉 Menos Espectadores | Exibe primeiro as câmeras com menos espectadores. |

> “Em destaque” não representa uma seleção editorial do addon. A posição segue a ordem retornada pelo diretório.

## 🚀 Instalação no Stremio

Use o endereço do manifest:

```text
[https://brazilcam4-nuvio.onrender.com/manifest.json](https://brazilcam4-nuvio.onrender.com/manifest.json)
```

1. Abra o Stremio.
2. Acesse a seção de addons.
3. Insira o endereço do manifest no campo de instalação por URL.
4. Confirme a instalação.
5. Acesse o catálogo `CAM4 Brasil`.
6. Escolha uma câmera e abra a transmissão disponível.

> A disposição dos menus pode variar conforme a versão e a plataforma do Stremio.

## 🧭 Como usar

### Explorar as câmeras

Abra o catálogo `CAM4 Brasil` para visualizar as transmissões encontradas.

### Alterar a ordenação

No seletor do catálogo, escolha:

```text
Em destaque
Mais Espectadores
Menos Espectadores
```

### Buscar uma câmera

O addon oferece busca pelo nome de usuário. Os resultados ficam limitados às câmeras encontradas no catálogo consultado.

## 🛠️ Tecnologias

| Componente | Uso |
| :--- | :--- |
| Node.js | Execução do servidor |
| Express | Servidor HTTP |
| Stremio Addon SDK | Manifest, catálogo, metadados e streams |
| HLS | Formato das transmissões |
| Render | Hospedagem da instância pública |

## 📁 Estrutura do projeto

```text
.
├── index.js
├── package.json
├── package-lock.json
├── .gitignore
└── README.md
```

### Arquivos principais

- `index.js`: implementação do addon.
- `package.json`: dependências e comandos do projeto.
- `package-lock.json`: versões registradas das dependências.
- `.gitignore`: exclusões para o controle de versão.
- `README.md`: apresentação e instruções.

## 💻 Execução local

### 1. Obtenha o projeto

Clone o repositório ou baixe seus arquivos e abra a pasta do projeto no terminal.

### 2. Instale as dependências

```bash
npm install
```

### 3. Inicie o servidor

```bash
node index.js
```

O endereço local padrão do manifest é:

```text
http://127.0.0.1:7000/manifest.json
```

Para conferir a sintaxe antes de executar:

```bash
node --check index.js
```

> Em outro dispositivo, `127.0.0.1` aponta para o próprio dispositivo, não para a máquina em que o addon está rodando.

## ☁️ Hospedagem no Render

### Configuração do serviço

| Campo | Configuração |
| :--- | :--- |
| Tipo | Web Service |
| Ambiente | Node.js |
| Build Command | `npm install` |
| Start Command | `node index.js` |

### Variáveis de ambiente

| Variável | Descrição |
| :--- | :--- |
| `PUBLIC_URL` | Endereço público do serviço, sem barra no final |
| `PORT` | Porta utilizada pelo servidor; o código usa `7000` quando ela não está definida |

Exemplo para a instância pública deste projeto:

```text
PUBLIC_URL=[https://brazilcam4-nuvio.onrender.com](https://brazilcam4-nuvio.onrender.com)
```

Se hospedar sua própria instância, substitua pelo endereço do seu serviço.

## ⚙️ Como funciona

```text
Stremio
   │
   ▼
Addon CAM4 Brasil
   │
   ├── Consulta o diretório do CAM4
   ├── Filtra as câmeras brasileiras
   ├── Aplica busca, ordenação e paginação
   └── Retorna a URL HLS da câmera escolhida
```

O addon não baixa os segmentos de vídeo para retransmiti-los pelo seu servidor. Ele devolve ao cliente a URL fornecida pelo CAM4 e os cabeçalhos de reprodução configurados no código.

O catálogo consulta até 15 páginas do diretório, em lotes de cinco requisições. Por isso, a lista não deve ser interpretada como um inventário completo de todas as câmeras brasileiras online.

## 🔄 Atualizações

Após alterar o código:

1. Confira a sintaxe com `node --check index.js`.
2. Envie os arquivos atualizados ao GitHub.
3. Aguarde o deploy do Render ou inicie uma publicação manual.
4. Confira os logs do serviço.

Quando houver mudanças no manifest ou nas opções do catálogo, reinstale o addon no Stremio para atualizar a configuração utilizada pelo aplicativo.

## 🧩 Solução de problemas

### O catálogo está vazio

Confira os logs do servidor. O código pode retornar uma lista vazia quando a consulta ao diretório falha ou quando nenhuma câmera correspondente é encontrada.

### Uma câmera aparece, mas não abre

A presença no catálogo não garante que a transmissão continue disponível no momento da reprodução. O addon só oferece um stream quando a consulta da câmera retorna uma URL HLS.

### As opções antigas continuam aparecendo

Feche a transmissão, remova a instalação anterior do addon e instale novamente pelo manifest.

### Quero usar chat ou legendas

Esta versão não inclui esses recursos. Seu foco é apenas:

```text
Câmeras + busca + ordenações + reprodução
```

## 🔐 Segurança e configuração

Não publique no repositório:

- Senhas.
- Tokens de acesso.
- Cookies de sessão.
- Arquivos `.env` com informações privadas.
- A pasta `node_modules`.

As configurações da hospedagem devem ser definidas no ambiente do serviço.

## ⚠️ Avisos importantes

- Projeto independente e não oficial, sem afiliação com CAM4 ou Stremio.
- Conteúdo destinado exclusivamente a maiores de 18 anos.
- O addon depende de serviços externos e pode ser afetado por mudanças nesses serviços.
- A identificação do país utiliza as informações retornadas pelo diretório.
- O projeto não inclui gravação ou download de transmissões.
- Utilize o serviço respeitando os termos das plataformas, a privacidade dos participantes e a legislação aplicável.

---

<div align="center">

### 🇧🇷 CAM4 Brasil

Menos complicação. Mais foco nas transmissões.

📺 Câmeras · 🔎 Busca · 🎛️ Ordenações

</div>
