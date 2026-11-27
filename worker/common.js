export class Problem extends Error {
  constructor(status,message){ super(message); this.status=status; }
}
export function requireThat(condition,status,message){ if(!condition) throw new Problem(status,message); }
export function json(value,status=200,extra={}) {
  return Response.json(value,{status,headers:{'Cache-Control':'no-store',...extra}});
}
export async function readJSON(req){
  try {return await req.json();} catch {throw new Problem(400,'Invalid request data.');}
}
