// A bounded expression parser. References are resolved by an explicit resolver;
// there is no object traversal, dynamic code, property invocation or eval.
const reFunctions={floor:Math.floor,ceil:Math.ceil,min:Math.min,max:Math.max,abs:Math.abs,percent:(x,p)=>x*p/100,clamp:(x,min,max)=>Math.max(min,Math.min(max,x))};
const rePrecedence={'||':1,'&&':2,'==':3,'!=':3,'<':4,'<=':4,'>':4,'>=':4,'+':5,'-':5,'*':6,'/':6,'%':6};
export function parseRuleExpression(source){
 if(typeof source==='number'){if(!Number.isFinite(source))throw Error('invalid_formula：数值不是有限数。');return {kind:'number',value:source};}
 if(typeof source!=='string'||!source.trim()||source.length>1024)throw Error('invalid_formula：公式须为1至1024字。');
 const tokens=[];let pos=0;
 while(pos<source.length){const rest=source.slice(pos),space=rest.match(/^\s+/);if(space){pos+=space[0].length;continue;}const token=rest.match(/^(?:\d+(?:\.\d+)?|\.\d+)|^[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*|^(?:<=|>=|==|!=|&&|\|\||[+\-*/%(),!<>])/);if(!token)throw Error(`invalid_formula：第${pos+1}位不支持的字符。`);tokens.push(token[0]);pos+=token[0].length;if(tokens.length>256)throw Error('formula_budget_exceeded：公式节点过多。');}
 let index=0;const refs=new Set();
 function parse(min=0,depth=0){if(depth>32)throw Error('formula_budget_exceeded：公式嵌套过深。');let token=tokens[index++],left;
  if(['+','-','!'].includes(token))left={kind:'unary',op:token,value:parse(7,depth+1)};
  else if(token==='('){left=parse(0,depth+1);if(tokens[index++]!==')')throw Error('invalid_formula：缺少右括号。');}
  else if(token!==undefined&&!Number.isNaN(Number(token)))left={kind:'number',value:Number(token)};
  else if(token&&/^[a-zA-Z_]/.test(token)){
   if(token.split('.').some(p=>['__proto__','constructor','prototype','eval','Function','globalThis','window','this'].includes(p)))throw Error('invalid_reference：禁止的名称。');
   if(tokens[index]==='('){if(!Object.hasOwn(reFunctions,token))throw Error('invalid_formula：不支持的函数。');index++;const args=[];if(tokens[index]!==')')do{args.push(parse(0,depth+1));if(tokens[index]!==',')break;index++;}while(true);if(tokens[index++]!==')')throw Error('invalid_formula：函数括号不完整。');if(args.length<1||args.length>16)throw Error('invalid_formula：函数参数数量错误。');const arity={floor:1,ceil:1,abs:1,percent:2,clamp:3};if(arity[token]&&args.length!==arity[token])throw Error('invalid_formula：函数参数数量错误。');left={kind:'call',name:token,args};}
   else{refs.add(token);left={kind:'ref',name:token};}
  }else throw Error('invalid_formula：缺少数值或引用。');
  while(Object.hasOwn(rePrecedence,tokens[index])&&rePrecedence[tokens[index]]>=min){const op=tokens[index++];left={kind:'binary',op,left,right:parse(rePrecedence[op]+1,depth+1)};}return left;
 }
 const tree=parse();if(index!==tokens.length)throw Error('invalid_formula：公式末尾有多余内容。');return {...tree,references:[...refs]};
}
export function evaluateRuleExpression(source,resolve){
 const ast=typeof source==='object'?source:parseRuleExpression(source);let budget=512;
 function evaluate(node){if(--budget<0)throw Error('formula_budget_exceeded');let result;
  if(node.kind==='number')result=node.value;
  else if(node.kind==='ref'){result=resolve(node.name);if(result===undefined)throw Error('unknown_reference：'+node.name);}
  else if(node.kind==='call')result=reFunctions[node.name](...node.args.map(evaluate));
  else if(node.kind==='unary'){const v=evaluate(node.value);result=node.op==='-'?-v:node.op==='!'?!v:+v;}
  else{const l=evaluate(node.left);if(node.op==='&&')return l?evaluate(node.right):false;if(node.op==='||')return l||evaluate(node.right);const r=evaluate(node.right);if((node.op==='/'||node.op==='%')&&r===0)throw Error('invalid_formula：不能除以零。');result={'+':()=>l+r,'-':()=>l-r,'*':()=>l*r,'/':()=>l/r,'%':()=>l%r,'<':()=>l<r,'<=':()=>l<=r,'>':()=>l>r,'>=':()=>l>=r,'==':()=>l===r,'!=':()=>l!==r}[node.op]();}
  if(typeof result!=='number'&&typeof result!=='boolean'||!Number.isFinite(Number(result))||Math.abs(Number(result))>1e12)throw Error('invalid_formula：引用不是有效数值或计算溢出。');return result;
 }
 return evaluate(ast);
}
