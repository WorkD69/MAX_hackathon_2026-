import { CasePathSchema } from '@max-smart-city/contracts';
import type { RuntimeConfig } from '../../config/types.js';
import type { RuntimeFastifyInstance } from '../../app/static.js';
import { respondError, handleError } from '../cases/commands/execution/http.js';
import type { CommandModuleOptions } from '../cases/commands/execution/http.js';
import { CaseReadService } from './service.js';
export function registerReadModelRoutes(app:RuntimeFastifyInstance,config:RuntimeConfig,options:CommandModuleOptions) {
  const service=new CaseReadService(options.database,config,options.nowSeconds);
  for(const path of ['/api/v1/cases','/api/v1/cases/:caseId','/api/v1/cases/:caseId/contractor-candidates'])
    app.get(path,async(request,reply)=>{
      reply.header('Cache-Control','no-store');
      if(!request.headers.authorization?.startsWith('Bearer '))return respondError(request,reply,401,'UNAUTHENTICATED');
      const token=request.headers.authorization.slice(7);
      try {
        if(path==='/api/v1/cases')return await service.list(token,request.query);
        const params=CasePathSchema.safeParse(request.params);
        if(!params.success)return respondError(request,reply,400,'VALIDATION_FAILED');
        return path.endsWith('contractor-candidates')?await service.candidates(token,params.data.caseId):await service.snapshot(token,params.data.caseId);
      }catch(error){return handleError(request,reply,error);}
    });
}
