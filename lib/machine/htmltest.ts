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
    Project,
    toStringArray,
} from "@atomist/automation-client";
import { microgrammar } from "@atomist/microgrammar";
import {
    CacheConfiguration,
    doWithProject,
    execPromise,
    ExecPromiseError,
    ExecPromiseResult,
    ExecuteGoal,
    GoalInvocation,
    GoalProjectListenerEvent,
    GoalProjectListenerRegistration,
    InterpretLog,
    ProgressLog,
    ProjectAwareGoalInvocation,
    spawnLog,
    SpawnLogOptions,
    SpawnLogResult,
} from "@atomist/sdm";
import { SpawnSyncOptions } from "child_process";
import * as fs from "fs-extra";
import _ = require("lodash");
import * as path from "path";
import { promisify } from "util";

export const MkdocsBuildAfterCheckout: GoalProjectListenerRegistration = {
    name: "mkdocs build",
    events: [GoalProjectListenerEvent.before],
    listener: async (project, goalInvocation, event) => {
        if (!await project.hasDirectory("site")) {
            const siteRoot = await project.getFile("site/index.html");
            if (siteRoot) {
                return { code: 0, message: "Looks OK, site directory already exists in " + project.baseDir };
            } else {
                logger.error("WTAF, site/ exists but not index.html");
            }
        }

        const inv: ProjectAwareGoalInvocation = toProjectAwareGoalInvocation(project, goalInvocation);

        logger.info("The MkdocsBuildAfterCheckout GoalProjectListener builds the docs with mkdocs.");
        {
            const pipResult = await inv.spawn("pip", ["install", "-r", "requirements.txt"]);
            if (pipResult.code !== 0) {
                // this is unexpected
                const message = pipResult.error ? pipResult.error.message : "See the log for output";
                return { code: pipResult.status || 2, message };
            }
        }

        await changeBranchInEditUrl(goalInvocation, project);
        // should I change it back after the build? Either could surprise people

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

/**
 * Finds the edit_uri in mkdocs.yml, and extracts the branch name
 */
const editUriPattern = /edit_uri: edit\/(master)\/docs/;
function editUriForBranch(branch: string): string {
    return `edit_uri: edit/${branch}/docs`;
}

async function changeBranchInEditUrl(goalInvocation: GoalInvocation, project: Project): Promise<void> {
    logger.info("The goal thinks it is on branch: " + goalInvocation.goalEvent.branch);
    logger.info("The project thinks it is on branch: " + project.id.branch);

    // we should never be here if this file doesn't exist
    const mkdocsYmlFile = await project.findFile("mkdocs.yml");
    const mkdocsYml: string = await mkdocsYmlFile.getContent();
    const editUriMatch = mkdocsYml.match(editUriPattern);
    if (!editUriMatch) {
        goalInvocation.progressLog.write(
            "No edit_uri defined in mkdocs.yml, so I won't update it based on the current branch");
        return;
    }
    const defaultBranch = editUriMatch[1];
    logger.info("The edit_uri has branch: " + defaultBranch);
    const currentBranch = goalInvocation.goalEvent.branch;
    if (currentBranch === defaultBranch) {
        goalInvocation.progressLog.write(
            "The edit_uri in mkdocs.yml looks correct for the current branch: " + defaultBranch);
        return;
    }
    goalInvocation.progressLog.write("Updating edit_uri in mkdocs.yml to point to branch: " +
        currentBranch);
    const newContent = mkdocsYml.replace(editUriPattern, editUriForBranch(currentBranch));
    await mkdocsYmlFile.setContent(newContent);
    return;
}

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

export const executeHtmltest: ExecuteGoal = doWithProject(async (inv: ProjectAwareGoalInvocation) => {

    inv.progressLog.write("This goal checks links in the generated HTML." +
        "It uses htmltest: https://github.com/wjdp/htmltest");
    await logHtmltestConfiguration(inv.progressLog, inv.project);
    const errors: string[] = []; // TODO: can eliminate because we are only doing one thing now

    await setUpCacheDirectory(inv);

    let htmltestResult: ExecPromiseError | ExecPromiseResult;
    try {
        htmltestResult = await inv.exec("htmltest", []);
    } catch (e) {
        const epe = e as ExecPromiseError;
        await inv.addressChannels(`htmltest failed on ${inv.id.sha} on ${inv.id.branch}: ${epe.message}`);
        errors.push(epe.message);
        htmltestResult = epe;
    }
    inv.progressLog.write(htmltestResult.stdout);
    inv.progressLog.write(htmltestResult.stderr);

    return { code: errors.length };
}, {
        // on a branch other than the default, it changes mkdocs.yml to update the editUri.
        readOnly: false,
    });

async function logHtmltestConfiguration(progressLog: ProgressLog, project: Project): Promise<void> {
    const configFile = await project.getFile(".htmltest.yml");
    if (!configFile) {
        progressLog.write("No configuration. File does not exist: .htmltest.yml");
        return;
    }
    progressLog.write("----- contents of .htmltest.yml --------");
    progressLog.write(await configFile.getContent());
    progressLog.write("----- end .htmltest.yml --------");
}

async function setUpCacheDirectory(inv: ProjectAwareGoalInvocation): Promise<void> {
    const cacheConfig: CacheConfiguration["cache"] = inv.configuration.sdm.cache || {};
    if (!cacheConfig.enabled) {
        inv.progressLog.write("INFO: cache not enabled. No big deal.");
        return;
    }
    const configuredCacheDir = cacheConfig.path;
    if (!configuredCacheDir) {
        inv.progressLog.write("INFO: no cache directory configured. No big deal.");
        return;
    }
    const htmltestCacheDir = configuredCacheDir + path.sep + "htmltest";
    try {
        await fs.ensureDir(htmltestCacheDir);
    } catch (e) {
        inv.progressLog.write("Unable to create cache directory. Not using it. Error: " + e.message);
        return;
    }

    const htmltestLooksForCacheIn = inv.project.baseDir + path.sep + "tmp";
    if (await inv.project.hasDirectory("tmp")) {
        inv.progressLog.write("tmp already exists in project directory; not linking to cache");
        return;
    }

    inv.progressLog.write("Caching htmltest results in: " + htmltestCacheDir);
    await promisify(c =>
        fs.symlink(htmltestCacheDir, htmltestLooksForCacheIn, "dir",
            err => c(err, undefined)))();
}

export const htmltestLogInterpreter: InterpretLog = log => {

    const betweenEquals = microgrammar({
        // tslint:disable-next-line:no-invalid-template-strings
        phrase: "${equals} ${stuff} ${moreEquals}", terms: {
            equals: /=====+/,
            moreEquals: /=====+/,
        },
    });
    const match = betweenEquals.firstMatch(log);
    const relevantPart = match ? (match as any).stuff : log;
    const lastLine = log.trim().split("\n").reverse().shift();

    return {
        relevantPart,
        message: "htmltest: " + lastLine,
    };
};
