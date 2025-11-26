import { AuthGuard } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';

/* 
API Key Guard - protect routes with API key authentication
*/
@Injectable()
export class ApiKeyGuard extends AuthGuard('api-key') {}
