import { runAuthorityPendingTaskSweep } from "@/app/lib/juizes/authority-profile-pendency";

export class AuthorityProfilePendencySchedulerService {
  static async checkAuthorityPendencies() {
    return runAuthorityPendingTaskSweep();
  }
}
