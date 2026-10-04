/* Bom dia! -- rotina matinal: afirmacoes e oracao.
 *
 * Porte para a web do morning_app (Flet). Mesma logica de dados:
 * funcoes puras sobre um objeto `dados`, e uma unica porta de escrita
 * (`salvar`). Os dados ficam no localStorage deste aparelho e nunca saem
 * dele -- este repositorio so tem as frases de exemplo.
 */
"use strict";

const CHAVE = "bomdia.dados.v1";
const CHAVE_BACKUP = "bomdia.dados.bak";

const AFIRMACOES_SEMENTE = [
  "Hoje eu começo o dia com calma e com atenção ao que importa.",
  "Eu mereço uma rotina que cuida de mim, e não só que cobra de mim.",
  "Errar faz parte. O que eu faço depois do erro é que me define.",
  "Eu respeito os meus limites sem abrir mão dos meus objetivos.",
  "Eu falo comigo do jeito que falaria com alguém que eu amo.",
];

const ORACAO_SEMENTE = `Escreva aqui a sua oração ou o seu texto de manhã.

Pode ter vários parágrafos. Toque no lápis para editar sempre que quiser.`;

// ---------- dados ----------

function novoId() {
  return Math.random().toString(16).slice(2, 10).padEnd(8, "0");
}

function montar(textos, oracao) {
  const afirmacoes = textos.map((texto) => ({ id: novoId(), texto }));
  return {
    afirmacoes,
    oracao,
    ultima_id: afirmacoes.length ? afirmacoes[0].id : null,
  };
}

function semear() {
  return montar(AFIRMACOES_SEMENTE, ORACAO_SEMENTE);
}

function validar(d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) throw new Error("não é um objeto");
  if (!Array.isArray(d.afirmacoes)) throw new Error("'afirmacoes' não é uma lista");
  if (typeof d.oracao !== "string") throw new Error("'oracao' não é um texto");
  for (const item of d.afirmacoes) {
    if (!item || typeof item.id !== "string" || typeof item.texto !== "string") {
      throw new Error("há uma afirmação sem id ou sem texto");
    }
  }
}

/* Devolve [dados, aviso]. Se o que estiver guardado for ilegivel, guarda
 * uma copia em CHAVE_BACKUP antes de recomecar -- nada some em silencio. */
function carregar() {
  let bruto = null;
  try {
    bruto = localStorage.getItem(CHAVE);
  } catch (e) {
    return [semear(), "Este navegador não deixou guardar dados. As mudanças vão se perder ao fechar."];
  }

  if (bruto === null) {
    const d = semear();
    salvar(d);
    return [d, null];
  }

  try {
    const d = JSON.parse(bruto);
    validar(d);
    return [d, null];
  } catch (erro) {
    try { localStorage.setItem(CHAVE_BACKUP, bruto); } catch (e) { /* sem espaco */ }
    const d = semear();
    salvar(d);
    return [d, `Não consegui ler seus dados (${erro.message}). Uma cópia do que estava guardado foi preservada.`];
  }
}

function salvar(d) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(d));
    return true;
  } catch (e) {
    avisar("Não consegui salvar neste aparelho.");
    return false;
  }
}

function indice(d, id) {
  return d.afirmacoes.findIndex((item) => item.id === id);
}

function atual(d) {
  const lista = d.afirmacoes;
  if (!lista.length) {
    d.ultima_id = null;
    return null;
  }
  let i = indice(d, d.ultima_id);
  if (i < 0) {
    i = 0;
    d.ultima_id = lista[0].id;
  }
  return lista[i];
}

function posicao(d) {
  const item = atual(d);
  if (!item) return [0, 0];
  return [indice(d, item.id) + 1, d.afirmacoes.length];
}

function navegar(d, passo) {
  const item = atual(d);
  if (!item) return null;
  const n = d.afirmacoes.length;
  const destino = d.afirmacoes[(indice(d, item.id) + passo + n) % n];
  d.ultima_id = destino.id;
  return destino;
}

function adicionar(d, texto = "") {
  const item = { id: novoId(), texto };
  d.afirmacoes.push(item);
  d.ultima_id = item.id;
  return item;
}

function editar(d, id, texto) {
  const i = indice(d, id);
  if (i >= 0) d.afirmacoes[i].texto = texto;
}

function excluir(d, id) {
  const lista = d.afirmacoes;
  const i = indice(d, id);
  if (i < 0) return;
  const eraAAtual = d.ultima_id === id;
  lista.splice(i, 1);
  if (!lista.length) d.ultima_id = null;
  else if (eraAAtual) d.ultima_id = lista[i % lista.length].id;
}

/* Aceita tanto um backup completo quanto o formato curto {a: [...], o: "..."}. */
function normalizarImportado(obj) {
  if (obj && Array.isArray(obj.a) && typeof obj.o === "string") {
    if (!obj.a.every((t) => typeof t === "string")) throw new Error("afirmações inválidas");
    return montar(obj.a, obj.o);
  }
  validar(obj);
  return obj;
}

// ---------- importacao por link ----------
//
// Formato: #importar=<base64url de deflate-raw de JSON {a, o}>.
// O trecho depois do # nunca e enviado ao servidor: o conteudo vai direto
// do link para este aparelho.

async function lerLinkDeImportacao() {
  const prefixo = "#importar=";
  if (!location.hash.startsWith(prefixo)) return null;
  const b64 = location.hash.slice(prefixo.length).replace(/-/g, "+").replace(/_/g, "/");
  // tira o conteudo da barra de endereco e do historico o quanto antes
  history.replaceState(history.state, "", location.pathname + location.search);

  const binario = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const fluxo = new Blob([binario]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const texto = await new Response(fluxo).text();
  return normalizarImportado(JSON.parse(texto));
}

// ---------- interface ----------

const app = document.getElementById("app");
let [dados, avisoInicial] = carregar();
const estado = { tela: null, editando: false, aviso: avisoInicial };

const ICONES = {
  editar: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  excluir: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>',
  nova: '<path d="M12 5v14M5 12h14"/>',
};

function icone(nome) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nome]}</svg>`;
}

function esc(texto) {
  return String(texto)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

let temporizadorToast = null;
function avisar(texto) {
  const t = document.getElementById("toast");
  t.textContent = texto;
  t.classList.add("visivel");
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => t.classList.remove("visivel"), 2400);
}

function confirmar(titulo, texto, rotuloSim = "Confirmar", perigoso = false) {
  const dlg = document.getElementById("dialogo");
  document.getElementById("dialogo-titulo").textContent = titulo;
  document.getElementById("dialogo-texto").textContent = texto;
  const sim = document.getElementById("dialogo-sim");
  const nao = document.getElementById("dialogo-nao");
  sim.textContent = rotuloSim;
  sim.classList.toggle("perigo", perigoso);
  return new Promise((resolver) => {
    const fechar = (resposta) => {
      sim.onclick = nao.onclick = dlg.oncancel = null;
      dlg.close();
      resolver(resposta);
    };
    sim.onclick = () => fechar(true);
    nao.onclick = () => fechar(false);
    dlg.oncancel = (e) => { e.preventDefault(); fechar(false); };
    dlg.showModal();
  });
}

function faixaDeAviso() {
  if (!estado.aviso) return "";
  return `<div class="faixa"><p>${esc(estado.aviso)}</p>
    <button class="link" data-acao="entendi">Entendi</button></div>`;
}

function telaMenu() {
  return `
    ${faixaDeAviso()}
    <h1>Bom dia! ☀️</h1>
    <p class="subtitulo">Acorde, levante e comece bem o seu dia</p>
    <button class="botao largo" data-acao="abrir" data-tela="afirmacoes">✨ Afirmações</button>
    <button class="botao largo" data-acao="abrir" data-tela="oracao">🙏🏾 Oração</button>
    <div class="rodape-menu">
      <button class="link" data-acao="abrir" data-tela="conteudo">Meu conteúdo e backup</button>
    </div>`;
}

function rodapeVoltar() {
  return `<button class="link" data-acao="menu">Voltar ao menu</button>`;
}

function telaAfirmacoes() {
  const item = atual(dados);
  const [n, total] = posicao(dados);
  const titulo = `<div class="titulo-tela" style="color: var(--destaque)">AFIRMAÇÕES</div>`;

  if (!item) {
    return `${titulo}
      <p class="afirmacao vazia">Nenhuma afirmação ainda.</p>
      <button class="botao" data-acao="nova">Criar a primeira</button>
      ${rodapeVoltar()}`;
  }

  if (estado.editando) {
    return `${titulo}
      <div class="contador">${n}/${total}</div>
      <textarea id="campo" rows="5" aria-label="Texto da afirmação">${esc(item.texto)}</textarea>
      <div class="linha">
        <button class="botao metade" data-acao="salvar-afirmacao">Salvar</button>
        <button class="botao metade secundario" data-acao="cancelar">Cancelar</button>
      </div>
      ${rodapeVoltar()}`;
  }

  const texto = item.texto
    ? esc(item.texto)
    : `<span class="vazia">Vazia. Toque no lápis para escrever.</span>`;

  return `${titulo}
    <div class="contador">${n}/${total}</div>
    <div class="afirmacao" id="cartao">${texto}</div>
    <div class="linha">
      <button class="botao metade" data-acao="passo" data-passo="-1">Anterior</button>
      <button class="botao metade" data-acao="passo" data-passo="1">Próxima</button>
    </div>
    <div class="icones">
      <button class="icone" data-acao="editar" aria-label="Editar" title="Editar">${icone("editar")}</button>
      <button class="icone" data-acao="excluir" aria-label="Excluir" title="Excluir">${icone("excluir")}</button>
      <button class="icone" data-acao="nova" aria-label="Nova afirmação" title="Nova">${icone("nova")}</button>
    </div>
    ${rodapeVoltar()}`;
}

function telaOracao() {
  const titulo = `<div class="titulo-tela" style="color: var(--azul)">🙏🏾 ORAÇÃO 🙏🏾</div>`;

  if (estado.editando) {
    return `${titulo}
      <textarea id="campo" rows="14" aria-label="Texto da oração">${esc(dados.oracao)}</textarea>
      <div class="linha">
        <button class="botao metade" data-acao="salvar-oracao">Salvar</button>
        <button class="botao metade secundario" data-acao="cancelar">Cancelar</button>
      </div>
      ${rodapeVoltar()}`;
  }

  const texto = dados.oracao
    ? esc(dados.oracao)
    : `<span class="vazia">Vazia. Toque no lápis para escrever.</span>`;

  return `${titulo}
    <div class="oracao">${texto}</div>
    <div class="icones oracao-tela">
      <button class="icone" data-acao="editar" aria-label="Editar" title="Editar">${icone("editar")}</button>
    </div>
    ${rodapeVoltar()}`;
}

function telaConteudo() {
  return `
    <div class="titulo-tela">MEU CONTEÚDO E BACKUP</div>
    <div class="caixa">
      <h2>Colar várias afirmações</h2>
      <p>Uma por linha. Elas <strong>substituem</strong> a lista atual.</p>
      <textarea id="colar" rows="8" placeholder="Uma afirmação por linha"></textarea>
      <p></p>
      <button class="botao" data-acao="colar">Usar estas afirmações</button>
    </div>
    <div class="caixa">
      <h2>Backup</h2>
      <p>Seus textos ficam só neste aparelho. Guarde um backup de vez em quando:
        se os dados do navegador forem apagados, é com ele que você recupera tudo.</p>
      <div class="linha" style="justify-content: flex-start; flex-wrap: wrap">
        <button class="botao" data-acao="exportar">Salvar backup</button>
        <button class="botao secundario" data-acao="importar">Restaurar backup</button>
      </div>
    </div>
    ${rodapeVoltar()}`;
}

function desenhar() {
  const telas = {
    afirmacoes: telaAfirmacoes,
    oracao: telaOracao,
    conteudo: telaConteudo,
  };
  app.innerHTML = (telas[estado.tela] || telaMenu)();
  document.body.classList.toggle("oracao-aberta", estado.tela === "oracao");

  const campo = document.getElementById("campo");
  if (campo) {
    campo.focus();
    campo.setSelectionRange(campo.value.length, campo.value.length);
  }
  const cartao = document.getElementById("cartao");
  if (cartao) ativarDeslize(cartao);
  window.scrollTo(0, 0);
}

/* Arrastar o dedo para os lados troca de afirmacao. */
function ativarDeslize(el) {
  let x0 = null;
  let y0 = null;
  el.addEventListener("touchstart", (e) => {
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) passo(dx < 0 ? 1 : -1);
  });
}

// ---------- navegacao ----------
//
// Cada tela aberta empilha uma entrada no historico, para o botao Voltar
// do Android voltar ao menu em vez de fechar o app.

function abrir(tela) {
  estado.tela = tela;
  estado.editando = false;
  history.pushState({ tela }, "");
  desenhar();
}

function irAoMenu() {
  if (history.state && history.state.tela) history.back();
  else {
    estado.tela = null;
    estado.editando = false;
    desenhar();
  }
}

window.addEventListener("popstate", (e) => {
  estado.tela = (e.state && e.state.tela) || null;
  estado.editando = false;
  desenhar();
});

function passo(direcao) {
  navegar(dados, direcao);
  salvar(dados);
  desenhar();
}

// ---------- acoes ----------

function baixarBackup() {
  const conteudo = JSON.stringify(dados, null, 2);
  const nome = `bom-dia-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const arquivo = new File([conteudo], nome, { type: "application/json" });

  if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
    navigator.share({ files: [arquivo], title: "Backup Bom dia" }).catch(() => {});
    return;
  }
  const url = URL.createObjectURL(arquivo);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  avisar("Backup salvo em Downloads.");
}

async function substituirTudo(novos, origem) {
  const ok = await confirmar(
    "Substituir o conteúdo?",
    `${origem}: ${novos.afirmacoes.length} afirmações e a oração.\nO que está no app agora será trocado.`,
    "Substituir",
  );
  if (!ok) return false;
  dados = novos;
  salvar(dados);
  avisar("Pronto, conteúdo trocado.");
  return true;
}

document.getElementById("arquivo").addEventListener("change", async (e) => {
  const arquivo = e.target.files[0];
  e.target.value = "";
  if (!arquivo) return;
  try {
    const novos = normalizarImportado(JSON.parse(await arquivo.text()));
    if (await substituirTudo(novos, "Backup")) irAoMenu();
  } catch (erro) {
    avisar(`Esse arquivo não é um backup válido (${erro.message}).`);
  }
});

const ACOES = {
  entendi() { estado.aviso = null; desenhar(); },
  abrir(el) { abrir(el.dataset.tela); },
  menu() { irAoMenu(); },
  passo(el) { passo(Number(el.dataset.passo)); },
  editar() { estado.editando = true; desenhar(); },
  cancelar() { estado.editando = false; desenhar(); },
  nova() {
    adicionar(dados);
    salvar(dados);
    estado.editando = true;
    desenhar();
  },
  async excluir() {
    const item = atual(dados);
    if (!item) return;
    if (!(await confirmar("Excluir esta afirmação?", "Não dá para desfazer.", "Excluir", true))) return;
    excluir(dados, item.id);
    salvar(dados);
    desenhar();
  },
  "salvar-afirmacao"() {
    const item = atual(dados);
    editar(dados, item.id, document.getElementById("campo").value.trim());
    salvar(dados);
    estado.editando = false;
    desenhar();
  },
  "salvar-oracao"() {
    dados.oracao = document.getElementById("campo").value;
    salvar(dados);
    estado.editando = false;
    desenhar();
  },
  async colar() {
    const linhas = document.getElementById("colar").value
      .split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!linhas.length) {
      avisar("Cole pelo menos uma afirmação.");
      return;
    }
    if (await substituirTudo(montar(linhas, dados.oracao), "Texto colado")) irAoMenu();
  },
  exportar() { baixarBackup(); },
  importar() { document.getElementById("arquivo").click(); },
};

app.addEventListener("click", (e) => {
  const el = e.target.closest("[data-acao]");
  if (el && ACOES[el.dataset.acao]) ACOES[el.dataset.acao](el);
});

// ---------- inicio ----------

async function importarDoLink() {
  try {
    const novos = await lerLinkDeImportacao();
    if (novos && (await substituirTudo(novos, "Link de importação"))) {
      estado.tela = null;
      estado.editando = false;
      desenhar();
    }
  } catch (erro) {
    avisar(`O link de importação está incompleto (${erro.message}).`);
  }
}

async function iniciar() {
  history.replaceState({ tela: null }, "");
  desenhar();

  await importarDoLink();
  // o link tambem pode ser aberto com o app ja aberto nesta aba
  window.addEventListener("hashchange", importarDoLink);

  // pede ao navegador para nao apagar os dados quando faltar espaco
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}

iniciar();
