import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../lib/errors';
import { sendSuccess } from '../../utils/response';
import {
  adminUserProfileService,
  type ProfileContext,
  type ProfileViewer,
} from './admin-user-profile.service';
import type {
  CreateNoteDto,
  NotesQueryDto,
  SectionQueryDto,
} from './admin-user-profile.validators';
import type { ProfileSection } from './admin-user-profile.types';

function ctx(req: Request): ProfileContext {
  const userAgent = req.headers['user-agent'];
  return {
    actorId: req.admin?.id,
    ip: req.ip,
    userAgent: Array.isArray(userAgent) ? userAgent.join(', ') : userAgent,
    requestId: String(req.id),
  };
}

/**
 * Resolve what the calling admin may see. `adminAuthorize('users.view')` has
 * already populated req.admin.roles/permissions. SUPER_ADMIN sees everything.
 * Compliance/risk sections require compliance.view; session revoke requires
 * users.manage; note management requires compliance.case.manage.
 */
function viewer(req: Request): ProfileViewer {
  const roles = req.admin?.roles ?? [];
  const perms = req.admin?.permissions ?? [];
  const isSuper = roles.includes('SUPER_ADMIN');
  const has = (p: string) => isSuper || perms.includes(p);
  return {
    complianceVisible: has('compliance.view'),
    canRevokeSessions: has('users.manage'),
    canManageNotes: has('compliance.case.manage'),
  };
}

export const adminUserProfileController = {
  async profile(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await adminUserProfileService.getProfile(
      req.params.userId,
      viewer(req),
      ctx(req),
    );
    sendSuccess(res, result);
  },

  async section(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const q = req.query as unknown as SectionQueryDto;
    const result = await adminUserProfileService.getSection(
      req.params.userId,
      req.params.section as ProfileSection,
      q.cursor,
      q.limit,
    );
    sendSuccess(res, result);
  },

  async revokeSession(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const result = await adminUserProfileService.revokeSession(
      req.params.userId,
      req.params.sessionId,
      ctx(req),
    );
    sendSuccess(res, result);
  },

  async listNotes(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const q = req.query as unknown as NotesQueryDto;
    const result = await adminUserProfileService.listComplianceNotes(
      req.params.userId,
      q.cursor,
      q.limit,
    );
    sendSuccess(res, result);
  },

  async addNote(req: Request, res: Response): Promise<void> {
    if (!req.admin) throw new UnauthorizedError();
    const body = req.body as CreateNoteDto;
    const result = await adminUserProfileService.addComplianceNote(
      req.params.userId,
      body.body,
      ctx(req),
    );
    sendSuccess(res, result, 201);
  },
};
