'use strict';
const express = require('express');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 10000);
const HOST = '0.0.0.0';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const ROOT_INDEX = path.join(ROOT, 'index.html');
const PUBLIC_INDEX = path.join(PUBLIC_DIR, 'index.html');

app.disable('x-powered-by');
app.use(express.json({limit:'20mb'}));
app.use(express.urlencoded({extended:true, limit:'2mb'}));

// Dados de sessão do servidor. O aplicativo continua funcionando sem banco;
// se DATABASE_URL for configurado futuramente, ele pode ser conectado sem
// alterar a interface.
const state = {
  fabrics: [],
  history: [],
  romaneios: [],
  drafts: {},
  aviamentos: [],
  companies: [{id:1,name:'EMPRESA PRINCIPAL',cnpj:'',plan:'LOCAL',status:'ATIVA'}],
  offices: [],
  officeShipments: [],
  users: [{id:1,username:'OWNER',role:'OWNER',company_id:1}],
  contextCompanyId: 1
};

const defaultAviamentos = [
  ['ZÍPER BEGE 15CM','UN'],['ZÍPER CAQUI 15CM','UN'],['ZÍPER AZUL 15CM','UN'],
  ['ZÍPER CINZA 15CM','UN'],['ZÍPER PRETO 15CM','UN'],['COURO AZUL','UN'],
  ['COURO PRETO','UN'],['COURO MARROM','UN'],['REFLETIVO','M'],['CÓS','M'],
  ['ELÁSTICO','M'],['CORDÃO','M'],['BOTÃO DE FERRO','UN'],['BOTÃO COQUINHO','UN'],
  ['TAG','UN'],['CAIXA DE FÓSFORO RETA','UN'],['CAIXA DE FÓSFORO SLIM','UN'],
  ['FACA','UN'],['LIXA','UN'],['SILICONE','UN'],['ETIQUETA TAMANHO 38','G'],
  ['ETIQUETA TAMANHO 40','G'],['ETIQUETA TAMANHO 42','G'],['ETIQUETA TAMANHO 44','G'],
  ['ETIQUETA TAMANHO 46','G'],['ETIQUETA TAMANHO 48','G'],['ETIQUETA COMPOSIÇÃO JEANS','G'],
  ['ETIQUETA COMPOSIÇÃO SARJA','G']
];
defaultAviamentos.forEach(([name,unit],i)=>state.aviamentos.push({id:String(i+1),name,unit,stock:0,version:1}));

function uid(){ return crypto.randomUUID(); }
function now(){ return new Date().toISOString(); }
function num(v,d=0){ const n=Number(v); return Number.isFinite(n)?n:d; }
function json(res,data,status=200){ return res.status(status).json(data); }
function notFound(res){ return json(res,{error:'NOT_FOUND'},404); }
function currentCompany(){ return state.companies.find(x=>x.id===state.contextCompanyId) || state.companies[0]; }
function findAvi(id){ return state.aviamentos.find(x=>String(x.id)===String(id)); }

app.get('/api/health',(req,res)=>json(res,{ok:true,version:'V40 RENDER LIMPO',server:true,database:false,loginConfigured:false,aiConfigured:false,uptime:process.uptime()}));
app.get('/api/auth/me',(req,res)=>json(res,{authenticated:true,user:state.users[0]}));
app.post('/api/auth/guest',(req,res)=>json(res,{ok:true,authenticated:true,user:state.users[0]}));
app.get('/api/auth/status',(req,res)=>json(res,{configured:false,userConfigured:false}));
app.post('/api/auth/logout',(req,res)=>json(res,{ok:true}));

app.get('/api/tecidos',(req,res)=>json(res,{fabrics:state.fabrics}));
app.post('/api/tecidos',(req,res)=>{
  const b=req.body||{}; const fabric={id:uid(),fabric:String(b.fabric||'').toUpperCase(),nf:String(b.nf||''),date:b.date||now().slice(0,10),ref:String(b.ref||''),rolls:Array.isArray(b.rolls)?b.rolls.map(r=>({...r,id:r.id||uid(),meters:num(r.meters)})):[],created_at:now()};
  if(!fabric.fabric||!fabric.rolls.length) return json(res,{error:'DADOS_INVALIDOS'},400);
  state.fabrics.push(fabric); return json(res,{fabric},201);
});
app.post('/api/tecidos/saida',(req,res)=>{
  const b=req.body||{}; let found=null, owner=null;
  for(const f of state.fabrics){ const r=(f.rolls||[]).find(x=>String(x.id)===String(b.rollId)); if(r){found=r;owner=f;break;} }
  const m=num(b.meters); if(!found||m<=0) return json(res,{error:'ROLO_INVALIDO'},400);
  if(m>num(found.meters)) return json(res,{error:'METRAGEM_INSUFICIENTE'},409);
  found.meters=Number((num(found.meters)-m).toFixed(3));
  return json(res,{fabric:owner},200);
});
app.get('/api/movimentos',(req,res)=>json(res,{history:state.history}));

app.get('/api/romaneios',(req,res)=>json(res,{romaneios:state.romaneios}));
app.post('/api/romaneios',(req,res)=>{ const x={id:uid(),payload:req.body?.payload||{},status:'SALVO',created_at:now()};state.romaneios.unshift(x);return json(res,{romaneio:x},201); });
app.post('/api/romaneios/draft',(req,res)=>{const k=String(req.body?.draftKey||'default');state.drafts[k]=req.body?.payload||{};return json(res,{ok:true});});

app.get('/api/aviamentos',(req,res)=>json(res,{aviamentos:state.aviamentos}));
app.patch('/api/aviamentos/:id',(req,res)=>{const x=findAvi(req.params.id);if(!x)return notFound(res);Object.assign(x,req.body||{});x.stock=num(x.stock);x.version=num(x.version,1)+1;return json(res,{aviamento:x});});
app.post('/api/aviamentos/sync',(req,res)=>{const incoming=Array.isArray(req.body?.aviamentos)?req.body.aviamentos:[];for(const item of incoming){const x=findAvi(item.id);if(x)Object.assign(x,item);else state.aviamentos.push({...item,id:item.id||uid(),stock:num(item.stock),version:1});}return json(res,{ok:true,aviamentos:state.aviamentos});});
app.post('/api/aviamentos/:id/movimento',(req,res)=>{const x=findAvi(req.params.id);if(!x)return notFound(res);const q=num(req.body?.quantity);const dir=num(req.body?.direction);if(q<=0||![-1,1].includes(dir))return json(res,{error:'MOVIMENTO_INVALIDO'},400);if(dir<0&&q>x.stock)return json(res,{error:'ESTOQUE_INSUFICIENTE'},409);x.stock=Number((x.stock+dir*q).toFixed(x.unit==='M'?2:3));x.version++;return json(res,{aviamento:x});});

app.get('/api/context',(req,res)=>json(res,{user:state.users[0],company:currentCompany()}));
app.get('/api/users',(req,res)=>json(res,{users:state.users}));
app.get('/api/companies',(req,res)=>json(res,{companies:state.companies}));
app.post('/api/companies',(req,res)=>{const b=req.body||{};const x={id:Math.max(0,...state.companies.map(c=>c.id))+1,name:String(b.name||'NOVA EMPRESA').toUpperCase(),cnpj:String(b.cnpj||''),plan:String(b.plan||'TESTE'),status:'ATIVA'};state.companies.push(x);return json(res,{company:x},201);});
app.post('/api/companies/:id/select',(req,res)=>{const id=num(req.params.id);if(!state.companies.some(c=>c.id===id))return notFound(res);state.contextCompanyId=id;return json(res,{ok:true,company:currentCompany()});});
app.get('/api/oficinas',(req,res)=>json(res,{oficinas:state.offices}));
app.post('/api/oficinas',(req,res)=>{const b=req.body||{};const x={id:Math.max(0,...state.offices.map(o=>num(o.id)))+1,name:String(b.name||'OFICINA').toUpperCase(),code:String(b.code||''),contact_name:String(b.contactName||''),phone:String(b.phone||''),address:String(b.address||''),active:true};state.offices.push(x);return json(res,{oficina:x},201);});
app.patch('/api/oficinas/:id',(req,res)=>{const x=state.offices.find(o=>String(o.id)===String(req.params.id));if(!x)return notFound(res);if(req.body&&'active' in req.body)x.active=Boolean(req.body.active);['name','code','contactName','phone','address'].forEach(k=>{if(req.body?.[k])x[k==='contactName'?'contact_name':k]=String(req.body[k]).toUpperCase()});return json(res,{oficina:x});});
app.get('/api/aviamentos/envios-oficina',(req,res)=>json(res,{envios:state.officeShipments}));
app.post('/api/aviamentos/envio-oficina',(req,res)=>{
  const b=req.body||{};const office=state.offices.find(o=>String(o.id)===String(b.oficinaId));if(!office)return json(res,{error:'OFICINA_INVALIDA'},400);
  const items=Array.isArray(b.items)?b.items.map(i=>({id:String(i.id),quantity:num(i.quantity)})).filter(i=>i.quantity>0):[];if(!items.length)return json(res,{error:'AVIAMENTO_INVALIDO'},400);
  for(const i of items){const a=findAvi(i.id);if(!a)return json(res,{error:'AVIAMENTO_NAO_ENCONTRADO'},400);if(a.stock<i.quantity)return json(res,{error:'ESTOQUE_INSUFICIENTE',item:a.name},409);}
  const outItems=[];for(const i of items){const a=findAvi(i.id);a.stock=Number((a.stock-i.quantity).toFixed(a.unit==='M'?2:3));a.version++;outItems.push({name:a.name,quantity:i.quantity,unit:a.unit});}
  const shipment={id:uid(),created_at:now(),oficina:office.name,oficina_id:office.id,oc:String(b.oc||''),username:'OWNER',notes:String(b.notes||''),items:outItems};state.officeShipments.unshift(shipment);return json(res,{envio:shipment},201);
});

app.post('/api/ai',(req,res)=>{
  const mode=String(req.body?.mode||'assistant');
  if(mode==='mini_risco_imagem') return json(res,{result:{oc:0,gradeTotal:0,pares:0,tamanhos:{},partes:{},confianca:0,observacao:'ANÁLISE DE IMAGEM NÃO CONFIGURADA NESTA VERSÃO. CONFIRA MANUALMENTE.'}});
  if(mode==='insights') return json(res,{result:{nivel:'OK',resumo:'ESTOQUE DISPONÍVEL PARA CONSULTA.',alertas:[],prioridades:[],recomendacoes:['MANTENHA AS ENTRADAS E SAÍDAS ATUALIZADAS.'],confianca:100}});
  return json(res,{result:{answer:'ESTOU ONLINE. POSSO AJUDAR COM ESTOQUE, METRAGEM, AVIAMENTOS, CORTES E HISTÓRICO. NESTA VERSÃO A IA EXTERNA NÃO ESTÁ CONECTADA.'}});
});
app.all('/api/*',(req,res)=>notFound(res));

app.use(express.static(PUBLIC_DIR,{extensions:['html']}));
app.get('*',(req,res)=>{
  const index = require('fs').existsSync(PUBLIC_INDEX) ? PUBLIC_INDEX : ROOT_INDEX;
  res.sendFile(index);
});

app.listen(PORT,HOST,()=>console.log(`ESTOQUE DE TECIDO PLUS+ V40 ONLINE EM http://${HOST}:${PORT}`));
