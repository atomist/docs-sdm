/*
 * Copyright © 2019 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    GitProject,
    logger,
    toStringArray,
} from "@atomist/automation-client";
import {
    doWithProject,
    execPromise,
    ExecPromiseError,
    ExecPromiseResult,
    ExecuteGoal,
    GoalInvocation,
    GoalProjectListener,
    GoalProjectListenerEvent,
    GoalProjectListenerRegistration,
    ProjectAwareGoalInvocation,
    spawnLog,
    SpawnLogOptions,
    SpawnLogResult,
} from "@atomist/sdm";
import { SpawnSyncOptions } from "child_process";

export const MkdocsBuildAfterCheckout: GoalProjectListenerRegistration = {
    name: "mkdocs build",
    events: [GoalProjectListenerEvent.before],
    listener: async (project, goalInvocation, event) => {
        if (!await project.hasDirectory("site")) {
            return { code: 0, message: "Looks OK, site directory already exists" };
        }

        const inv: ProjectAwareGoalInvocation = toProjectAwareGoalInvocation(project, goalInvocation);

        logger.error("I AM THE THING and I got event " + event + " for goal " + inv.goal.name);
        {
            const pipResult = await inv.spawn("pip", ["install", "-r", "requirements.txt"]);
            if (pipResult.code !== 0) {
                // this is unexpected
                const message = pipResult.error ? pipResult.error.message : "See the log for output";
                return { code: pipResult.status || 2, message };
            }
        }

        const errors: string[] = [];
        let mkdocsResult: ExecPromiseError | ExecPromiseResult;
        try {
            mkdocsResult = await inv.exec("mkdocs", ["build"]);
        } catch (e) {
            const epe = e as ExecPromiseError;
            await inv.addressChannels(`mkdocs failed on ${inv.id.sha} on ${inv.id.branch}: ${epe.message}`);
            errors.push(epe.message);
            mkdocsResult = epe;
        }
        inv.progressLog.write(mkdocsResult.stdout);
        inv.progressLog.write(mkdocsResult.stderr);

        return { code: errors.length };
    },
};

// TODO: move to @atomist/sdm
/**
 * Convenience method to create project aware goal invocations
 */
export function toProjectAwareGoalInvocation(project: GitProject, gi: GoalInvocation): ProjectAwareGoalInvocation {
    const { progressLog } = gi;

    function spawn(cmd: string, args: string[], opts: SpawnLogOptions): Promise<SpawnLogResult> {
        const optsToUse: SpawnLogOptions = {
            cwd: project.baseDir,
            log: progressLog,
            ...opts,
        };
        return spawnLog(cmd, toStringArray(args), optsToUse);
    }

    function exec(cmd: string,
                  args: string | string[] = [],
                  opts: SpawnSyncOptions = {}): Promise<ExecPromiseResult> {
        const optsToUse: SpawnSyncOptions = {
            cwd: project.baseDir,
            ...opts,
        };
        return execPromise(cmd, toStringArray(args), optsToUse);
    }

    return { ...gi, project, spawn, exec };
}

export const executeHtmlproof: ExecuteGoal = doWithProject(async (inv: ProjectAwareGoalInvocation) => {
    {
        const r = await inv.spawn("bundle", ["install"]);
        if (r.code !== 0) {
            // this is unexpected
            const message = r.error ? r.error.message : "See the log for output";
            return { code: r.status || 2, message };
        }
    }

    const errors: string[] = []; // TODO: can eliminate because we are only doing one thing now

    let htlmproofResult: ExecPromiseError | ExecPromiseResult;
    try {
        htlmproofResult = await inv.exec("./htmlproof.sh", []);
    } catch (e) {
        const epe = e as ExecPromiseError;
        await inv.addressChannels(`htmlproofer failed on ${inv.id.sha} on ${inv.id.branch}: ${epe.message}`);
        errors.push(epe.message);
        htlmproofResult = epe;
    }
    inv.progressLog.write(htlmproofResult.stdout);
    inv.progressLog.write(htlmproofResult.stderr);

    return { code: errors.length };
}, { readOnly: true });