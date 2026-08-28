import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { LinkHubApiClient, WorkContextRole } from "../api-client.js";
import type { DisclosureContext } from "../disclosure.js";
import { runTool, textResult } from "./shared.js";

/** Months rendered the way a human writes them on a CV. */
function formatDuration(months: number | null): string {
  if (months === null) return "duration unknown";
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;

  const years = Math.floor(months / 12);
  const rest = months % 12;
  const yearPart = `${years} year${years === 1 ? "" : "s"}`;
  return rest === 0 ? yearPart : `${yearPart} ${rest} month${rest === 1 ? "" : "s"}`;
}

function formatRole(role: WorkContextRole, index: number): string {
  const lines: string[] = [];

  const employer = role.companyName
    ? role.companyName
    : "(employer withheld by the disclosure policy — do not guess it)";

  lines.push(`### ${index + 1}. ${role.title}`);
  lines.push(`- Employer: ${employer}`);
  if (role.seniorityHint) lines.push(`- Seniority: ${role.seniorityHint}`);
  lines.push(
    `- Dates: ${role.startDate ?? "?"} → ${role.isCurrent ? "present" : (role.endDate ?? "?")} (${formatDuration(role.durationMonths)})`,
  );
  if (role.employmentType) lines.push(`- Employment type: ${role.employmentType}`);
  if (role.workModel) lines.push(`- Work model: ${role.workModel}`);
  if (role.domain) lines.push(`- Problem domain: ${role.domain}`);
  if (role.stack.length > 0) lines.push(`- Stack: ${role.stack.join(", ")}`);
  if (role.practices.length > 0) {
    lines.push(`- Engineering practices: ${role.practices.join(", ")}`);
  }
  if (role.achievements.length > 0) {
    lines.push(
      "- Achievements (employer and client names stripped; nothing else is):",
    );
    for (const achievement of role.achievements) {
      lines.push(`  - ${achievement}`);
    }
  }

  return lines.join("\n");
}

/**
 * `get_work_context` — the sanctioned source of employment facts.
 *
 * The description is deliberately blunt about where NOT to get this
 * information. A coding agent sits in a checkout full of employer fingerprints
 * (git remotes, scoped package names, directory paths), and inferring from them
 * is the single most likely way to leak a name the user asked to keep private.
 */
export function registerGetWorkContext(
  server: McpServer,
  client: LinkHubApiClient,
  disclosure: DisclosureContext,
): void {
  const policyNote = disclosure.degraded
    ? "The disclosure policy could not be read at startup (the token is probably " +
      "missing the profile:read scope), so this tool may fail the same way — if it " +
      "does, tell the user to create a token with profile:read."
    : `The user's disclosure level is "${disclosure.level}", so this tool returns ` +
      `exactly what that level permits and nothing more.`;

  server.registerTool(
    "get_work_context",
    {
      title: "Get my (redacted) work history",
      description:
        "Return the user's work history — roles, seniority, dates and duration, " +
        "employment type and work model, tech stack, engineering practices, " +
        "problem domain and achievements — with the employer and client names " +
        "on their denylist ALREADY STRIPPED by LinkHub, and nothing else " +
        "removed. THIS IS THE ONLY SANCTIONED SOURCE OF EMPLOYMENT " +
        "DETAIL. You must NOT infer the user's employer or client from git " +
        "remotes, package or scope names, directory paths, code comments, README " +
        "files, commit trailers, or anything else in the working tree — those " +
        "leak precisely the identifiers the policy protects. When a role comes " +
        "back with no employer name, that is the policy working: describe the " +
        "work without naming the company, never substitute a guess. " +
        policyNote +
        " Requires the profile:read token scope.",
      inputSchema: {},
    },
    async () =>
      runTool(async () => {
        const context = await client.getWorkContext();

        if (context.roles.length === 0) {
          return textResult(
            "No work history on this LinkHub profile yet. Do not invent one — " +
              "if the post needs employment context, ask the user to add their " +
              "roles in LinkHub first.",
          );
        }

        // Say exactly what the server did, and no more. LinkHub only strips
        // the user's blocked employer and client names; an agent told the whole
        // payload is "already redacted" stops reading the achievement it is
        // about to quote, which is how a ticket id reaches a public post.
        const header =
          `Work history at disclosure level "${context.disclosureLevel}" ` +
          `(${context.roles.length} role(s)). LinkHub has stripped the employer ` +
          `and client names on the user's denylist from this text — that is the ` +
          `ONLY category it removes. Ticket ids, customer names, internal ` +
          `codenames, unreleased products, architecture details and headcount ` +
          `figures are NOT stripped and may still appear below: leaving them out ` +
          `of the post is your job, not LinkHub's. Check the "You must not say" ` +
          `list for this level before quoting anything from here, and do not add ` +
          `anything that is not here either.`;

        return textResult(
          `${header}\n\n${context.roles.map(formatRole).join("\n\n")}`,
        );
      }),
  );
}
