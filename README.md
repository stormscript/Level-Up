# LevelUp 🎮

A tua vida em modo RPG: missões, hábitos, XP e níveis. Uma web app (PWA) feita para o iPhone, que funciona offline e guarda tudo só no teu telemóvel.

**Versão 0.1.0 — Fase 1 (MVP).**

---

## 🚀 Publicar no GitHub Pages (passo a passo)

### 1. Criar o repositório
1. Entra em [github.com](https://github.com) com a tua conta (cria uma, se não tiveres; é grátis).
2. Canto superior direito: **+** → **New repository**.
3. Em *Repository name* escreve `levelup`.
4. Escolhe **Public**. O GitHub Pages grátis exige repositórios públicos; os teus *dados* nunca vão para lá, só o código.
5. **Não** marques "Add a README". Carrega em **Create repository**.

### 2. Carregar os ficheiros (no computador)
1. Descompacta o `levelup.zip`.
2. Na página do repositório acabado de criar, clica no link **uploading an existing file**.
3. Abre a pasta `levelup` descompactada, seleciona **tudo o que está lá dentro** (`index.html`, `manifest.json`, `service-worker.js`, `tests.html`, `README.md`, `.nojekyll` e as pastas `css`, `js`, `icons`) e arrasta para a página.
   - O `index.html` tem de ficar na **raiz** do repositório, e não dentro de uma pasta `levelup/`.
   - O `.nojekyll` é um ficheiro oculto. No Mac, carrega em `Cmd + Shift + .` no Finder para o veres. Se não o conseguires carregar, a app funciona na mesma.
4. Em baixo, carrega em **Commit changes**.

### 3. Ativar o GitHub Pages
1. No repositório: **Settings** → (menu à esquerda) **Pages**.
2. Em *Source* escolhe **Deploy from a branch**.
3. Em *Branch* escolhe **main** e a pasta **/ (root)** → **Save**.
4. Espera 1 a 2 minutos e atualiza a página. Aparece o link: `https://O-TEU-UTILIZADOR.github.io/levelup/`

### 4. Abrir no iPhone
1. Abre o link no **Safari** (tem de ser o Safari).
2. Vais ver a app com um banner "Instala a LevelUp".

### 5. Adicionar ao ecrã principal
1. No Safari, toca em **Partilhar** (o quadrado com a seta para cima). No iOS 26 está dentro do botão **···**.
2. Desliza e escolhe **Adicionar ao ecrã principal**.
3. Confirma que "Abrir como Web App" está ligado → **Adicionar**.
4. A partir de agora, abre sempre a LevelUp pelo ícone do ecrã principal: ecrã inteiro, sem barras do Safari.

> ⚠️ Os dados da app instalada são diferentes dos do Safari. Usa sempre o ícone.

---

## 🔄 Atualizar a app mais tarde

1. Substitui os ficheiros alterados no GitHub (**Add file → Upload files**, arrasta-os e faz **Commit**). Ficheiros com o mesmo nome são substituídos.
2. **Importante:** abre o `service-worker.js` no GitHub (ícone do lápis ✏️) e muda o número da versão:
   ```js
   const CACHE_VERSION = 'levelup-v0.1.0';   // → 'levelup-v0.1.1'
   ```
   Sem este passo, o iPhone continua a mostrar a versão antiga (está guardada em cache para funcionar offline).
3. Se criares um ficheiro novo, acrescenta-o à lista `ASSETS` nesse mesmo ficheiro.
4. Espera 1 a 2 minutos pelo GitHub Pages.

### Forçar o iPhone a carregar a versão nova
- Abre a app. Em poucos segundos aparece **"✨ Nova versão disponível · Atualizar"** → toca nesse aviso.
- Se o aviso não aparecer: **fecha a app** (desliza para cima a partir do fundo e atira a LevelUp para fora) e abre-a outra vez. Às vezes são precisas duas aberturas.
- Último recurso: Definições do iPhone → Apps → Safari → Avançado → Dados de sites → apaga `github.io`. ⚠️ **Isto apaga os dados da app**: faz primeiro **Exportar backup**.

---

## 💾 Backup

Os dados vivem **só no teu iPhone** (IndexedDB). Não há servidor nem login.

- **Exportar:** Hoje → ⚙️ → *Exportar backup (JSON)* → "Guardar em Ficheiros" (ex.: iCloud Drive).
- **Importar:** ⚙️ → *Importar backup…* → escolhe o ficheiro `.json`. Substitui os dados atuais.
- Faz um backup pelo menos uma vez por semana. Na Fase 5 a app passa a lembrar-te disso.

## 🧪 Testes

Abre `https://O-TEU-UTILIZADOR.github.io/levelup/tests.html`. Deve aparecer **"Todos os testes passaram ✓"**.

## 🧭 Como usar

| Gesto | Ação |
|---|---|
| Tocar no círculo | Concluir / desfazer |
| Deslizar → | Concluir (ou desfazer, se já estiver feita) |
| Deslizar ← | Editar · Apagar |
| Tocar na missão | Editar |
| Botão **+** | Nova missão ou hábito |
| Tocar no separador ativo | Voltar ao topo |
| Arrastar um painel para baixo | Fechar |

**Regras:** Fácil 10 XP · Média 25 · Difícil 50 · Épica 100. XP para passar do nível *n* ao *n+1* = 100 × n^1.5. Apagar uma missão **não** tira o XP já ganho.

## 📁 Estrutura

```
index.html            página única (meta tags iOS, splash screens)
manifest.json         configuração da PWA
service-worker.js     cache offline + versão
tests.html            testes da lógica
css/                  base (cores, tema) · components · screens
js/app.js             arranque, separadores, atualizações
js/db.js              IndexedDB
js/state.js           dados em memória + gravação
js/engine/            regras (XP, datas, agenda) — funções puras e testadas
js/ui/                bottom sheet, gestos, título grande, efeitos
js/screens/           ecrãs (Hoje, Personagem, Definições…)
icons/                ícones e splash screens
```

Sem bibliotecas externas e sem passo de build: editas um ficheiro, carregas e está feito.
