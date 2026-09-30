/* Apresentação da conferência. As combinações e os resultados não são alterados. */
(function(root){
'use strict';
const L=root.LL18;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const status=(marked,drawn,checked)=>checked?(marked&&drawn?'acertou':drawn?'sorteada':marked?'errou':'neutra'):(marked?'marcada':'neutra');
const labels={acertou:'acerto',sorteada:'sorteada fora do jogo',errou:'marcada e não sorteada',marcada:'marcada, aguardando resultado',neutra:'não marcada'};
function legend(){return `<div class="legenda-cartela check-legend" aria-label="Legenda da conferência"><span><i class="check-hit"></i>Acerto</span><span><i class="check-drawn"></i>Sorteada fora do jogo</span><span><i class="check-miss"></i>Marcada e não sorteada</span></div>`;}
function ball(n,state,label=pad(n)){return `<span class="dz check-ball ${state==='sorteada'?'fora':state}" aria-label="${esc(label+', '+labels[state])}">${esc(label)}</span>`;}
function extras(m,t,r){
 const c=L.cfg(m),key=c.extra;if(!key||t[key]==null)return '';
 const title={trevos:'Trevos',mes:'Mês da Sorte',time:'Time do Coração'}[key];
 const marked=Array.isArray(t[key])?t[key]:[t[key]],drawn=r?.[key]==null?null:Array.isArray(r[key])?r[key]:[r[key]];
 const label=n=>key==='mes'?['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][n-1]:pad(n);
 return `<div class="check-extras"><b>${title}</b><div class="dezenas">${marked.map(n=>ball(n,status(true,drawn?.includes(n),!!drawn),label(n))).join('')}${(drawn||[]).filter(n=>!marked.includes(n)).map(n=>ball(n,'sorteada',label(n))).join('')}</div>${r&&!drawn?'<small>Complemento ainda não publicado.</small>':''}</div>`;
}
function ticket(m,t,r=null){
 const c=L.cfg(m);
 const numbers=c.colunas?t.colunas.map((a,i)=>`<div class="check-column"><small>Coluna ${i+1}</small><div class="dezenas">${a.map(n=>ball(n,status(true,r?.colunas?.[i]?.includes(n),!!r),String(n))).join('')}</div></div>`).join(''):t.dezenas.map(n=>ball(n,status(true,r?.dezenas?.includes(n),!!r))).join('');
 return `<div class="dezenas check-ticket">${numbers}</div>${extras(m,t,r)}`;
}
function board(m,t,r=null,op={}){
 const c=L.cfg(m),columns=c.colunas?7:op.colunas||(m==='lotofacil'?5:m==='dia-de-sorte'?7:10);
 const marked=new Set(t.dezenas||[]),drawn=r?new Set(r.dezenas||[]):null,cells=[];
 const cell=(n,col)=>{
  const selected=c.colunas?t.colunas[col].includes(n):marked.has(n),hit=c.colunas?r?.colunas?.[col]?.includes(n):drawn?.has(n);
  const state=status(selected,hit,!!r),prefix=c.colunas?'Coluna '+(col+1)+', ':'';
  return `<button type="button" class="casa ${state}" ${op.interativa?'':'disabled'} data-casa="${n}" ${c.colunas?'data-coluna="'+col+'"':''} aria-pressed="${selected}" aria-label="${prefix}${pad(n)}, ${labels[state]}"><span>${c.colunas?n:pad(n)}</span></button>`;
 };
 if(c.colunas){
  for(let i=0;i<7;i++)cells.push(`<div class="check-column-title">C${i+1}</div>`);
  for(let n=0;n<10;n++)for(let i=0;i<7;i++)cells.push(cell(n,i));
 }else for(let n=c.base;n<c.base+c.N;n++)cells.push(cell(n));
 const count=c.colunas?t.colunas.reduce((n,a)=>n+a.length,0):marked.size;
 const hits=r?L.hits(m,t,r):null;
 const footer=op.rodape||(hits==null?'':`<div class="pe"><span>${hits} acerto${hits===1?'':'s'}${c.colunas?' por coluna':''}</span><span>${count} ${c.colunas?'marcações':'dezenas marcadas'}</span></div>`);
 return `<div class="cartela check-board"><div class="tarja"><b>${esc(c.nome)}</b><span>${esc(op.selo||count+'/'+(c.colunas?70:c.N))}</span></div><div class="miolo"><div class="grade-volante" style="grid-template-columns:repeat(${columns},1fr)" ${op.interativa?'id="volante"':''}>${cells.join('')}</div></div>${footer}</div>`;
}
root.LL18Check={board,ticket,legend,extras};
})(globalThis);
