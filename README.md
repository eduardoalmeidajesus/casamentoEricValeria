# 💍 Éric & Valéria — Site de Casamento

Site para o casamento de **Éric & Valéria** (12 de Setembro de 2026), com lista de presentes via Pix, confirmação de presença e painel administrativo para os noivos.

---

## ✨ Funcionalidades

- **Contagem regressiva** até o dia do casamento
- **Lista de presentes** com busca, ordenação e geração automática de QR Code Pix por presente
- **Confirmação de presença** integrada ao WhatsApp
- **Painel `/admin`** com login protegido para os noivos acompanharem presentes confirmados e presenças
- Banco de dados **PostgreSQL** (produção) ou arquivo JSON local (desenvolvimento)

---

## 🚀 Deploy no Railway

`[https://casamentoericvaleria.up.railway.app/](https://casamentoericvaleria.up.railway.app/)`

---

## 💻 Desenvolvimento local

### Requisitos

- Node.js 18+

### Instalação

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/casamento-eric-valeria.git
cd casamento-eric-valeria

# Instale as dependências
npm install

# Inicie o servidor
npm start
```

O site estará disponível em `http://localhost:3000`.

Em desenvolvimento, o banco de dados é um arquivo JSON em `data/db.json`, criado automaticamente na primeira execução a partir dos presentes em `data/seed-gifts.json`.

### Painel administrativo

Acesse `http://localhost:3000/admin` com as credenciais:

- **Usuário:** `noivos`
- **Senha:** `12092026`

---

## 📁 Estrutura do projeto

```
├── assets/              # Imagens e recursos estáticos
├── data/
│   ├── seed-gifts.json  # Lista inicial de presentes
│   └── db.json          # Banco de dados local (gerado automaticamente)
├── scripts/             # Scripts auxiliares
├── admin.html           # Painel dos noivos
├── index.html           # Site dos convidados
├── script.js            # Lógica do front-end
├── server.js            # Servidor Node.js + API
├── style.css            # Estilos
└── package.json
```

---

## 🔑 Chave Pix e dados do casamento

As informações do casamento ficam no topo do arquivo `script.js`:

```js
var PIX_KEY      = "skravonskiericanderson@gmail.com";
var PIX_CITY     = "CASCAVEL";
var PIX_MERCHANT = "ERIC E VALERIA";
var WHATSAPP_NUMBER = "554599725915";
var WEDDING_DATE = new Date(2026, 8, 12, 16, 0, 0);
```

---

## 🛠️ Stack

- **Back-end:** Node.js (sem frameworks externos)
- **Banco de dados:** PostgreSQL em produção · JSON em desenvolvimento
- **Front-end:** HTML, CSS e JavaScript puro
- **Fontes:** Cormorant Garamond + Inter (Google Fonts)
- **Pix:** geração de payload EMV e QR Code via [goqr.me API](https://api.qrserver.com)
