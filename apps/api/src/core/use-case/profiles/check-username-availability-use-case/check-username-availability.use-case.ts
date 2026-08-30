import { isReservedUsername } from "@repo/schemas";
import { IUsersRepository } from "../../../repositories/user/user-repository.js";

export type UsernameAvailabilityResult = {
  username: string;
  isAvailable: boolean;
  reason: "taken" | "reserved" | null;
};

/**
 * Answers "could I have this handle?" while the user is still typing it.
 *
 * TWO RULES, IN THE ORDER THE SAVE APPLIES THEM. `updateProfileSchemaInput`
 * refuses a reserved name before any repository is touched, so a reserved name
 * is unavailable even when no account holds it — reporting it as free would
 * send the user to a Save that rejects them for a reason the form never
 * mentioned.
 *
 * `findByLogin` is the SAME lookup `UpdateProfileUseCase` performs, and that is
 * the point rather than an accident: a check that is stricter than the save
 * tells people a name is taken when it would in fact have been accepted, and a
 * looser one promises a name the save then refuses. Its case sensitivity
 * (`login` is compared with `=`) is inherited deliberately — see
 * `docs/qa/bugs/ESC-20260827-register-case-race.md`; fixing it belongs with the
 * save, not here, and diverging would put the two out of step.
 *
 * `viewerUserId` is what stops the form calling a person's OWN handle taken.
 * They own it; it is available TO THEM, and the save agrees (it skips the
 * duplicate lookup entirely when the name has not changed).
 */
export class CheckUsernameAvailabilityUseCase {
  constructor(private usersRepository: IUsersRepository) {}

  async execute(
    username: string,
    viewerUserId?: string,
  ): Promise<UsernameAvailabilityResult> {
    if (isReservedUsername(username)) {
      return { username, isAvailable: false, reason: "reserved" };
    }

    const owner = await this.usersRepository.findByLogin(username);

    if (!owner || (viewerUserId && owner.id === viewerUserId)) {
      return { username, isAvailable: true, reason: null };
    }

    return { username, isAvailable: false, reason: "taken" };
  }
}
