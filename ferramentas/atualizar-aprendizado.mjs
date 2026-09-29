/* Executado após a ingestão oficial: confere o pacote anterior e sela o próximo. */
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),L=require('../ui/lab-auto.js');
const root=join(dirname(fileURLToPath(import.meta.url)),'..'),dir=join(root,'aprendizado');
mkdirSync(dir,{recursive:true});
for(const file of readdirSync(join(root,'dados')).filter(f=>f.endsWith('.json'))){
 const data=JSON.parse(readFileSync(join(root,'dados',file),'utf8')),m=data.modalidade;
 if(!L.rules[m])continue;
 const path=join(dir,file),old=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{};
 const base=L.recommendationBase(m,data.concursos,{});
 if(base.meta.invalidos||base.meta.conflitos)throw Error(m+': base inválida; livro preservado.');
 if(old.ultimaBase?.assinatura===base.meta.assinatura&&old.protocolo===L.autoProtocol){console.log(m+': sem alteração.');continue;}
 const cycle=L.autoCycle(m,data.concursos,old);
 writeFileSync(path,JSON.stringify(cycle.estado)+'\n');
 console.log(m+': '+cycle.acompanhamento.n+' resultados conferidos; pacote '+cycle.rodada.concursoAlvo+' registrado; '+cycle.decisao.acao+'.');
}
