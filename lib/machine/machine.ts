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

import { logger } from "@atomist/automation-client";
import {
    allOf,
    AutoCodeInspection,
    Autofix,
    Fingerprint,
    goal,
    goals,
    ImmaterialGoals,
    isMaterialChange,
    not,
    PushTest,
    slackReviewListenerRegistration,
    SoftwareDeliveryMachine,
    SoftwareDeliveryMachineConfiguration,
    ToDefaultBranch,
    whenPushSatisfies,
} from "@atomist/sdm";
import {
    createSoftwareDeliveryMachine,
    githubGoalStatusSupport,
    goalStateSupport,
} from "@atomist/sdm-core";
import { Build } from "@atomist/sdm-pack-build";
import { PublishToS3 } from "@atomist/sdm-pack-s3";
import { lintAutofix } from "../markdown/lint";
import { inspectReferences } from "../markdown/refcheck";
import {
    mkdocsBuilderRegistration,
} from "./../build/mkdocsBuilder";
import {
    AlphabetizeGlossaryAutofix,
    AlphabetizeGlossaryCommand,
} from "./alphabetizeGlossary";
import {
    CodeSnippetInlineAutofix,
    CodeSnippetInlineCommand,
} from "./codeSnippetInline";
import { CreateCodeSnippetInlineJobOnPushToSamples } from "./createCodeSnippetInlineJob";
import {
    PutTbdInEmptySectionsAutofix,
    PutTbdInEmptySectionsCommand,
} from "./emptySectionsContainTbd";
import {
    executeHtmlproof,
    htmltestLogInterpreter,
    MkdocsBuildAfterCheckout,
} from "./htmltest";
import {
    listTodoCodeInspectionRegistration,
} from "./listTodoCommand";
import { MkdocsSiteGenerator } from "./mkdocsGenerator";
import { executeMkdocsStrict } from "./mkdocsStrict";
import {
    TbdFingerprinterRegistration,
    tbdFingerprintListener,
} from "./tbdFingerprinter";

export function machine(
    configuration: SoftwareDeliveryMachineConfiguration,
): SoftwareDeliveryMachine {

    logger.info("The configured log level is: " + configuration.logging.level);

    const sdm = createSoftwareDeliveryMachine({
        name: "Atomist Documentation Software Delivery Machine",
        configuration,
    });

    sdm.addCodeTransformCommand(PutTbdInEmptySectionsCommand);
    sdm.addCodeTransformCommand(CodeSnippetInlineCommand);
    sdm.addCodeTransformCommand(AlphabetizeGlossaryCommand);

    sdm.addCodeInspectionCommand(listTodoCodeInspectionRegistration());

    const autofix = new Autofix().with(PutTbdInEmptySectionsAutofix)
        .with(AlphabetizeGlossaryAutofix)
        .with(CodeSnippetInlineAutofix)
        .with(lintAutofix);

    const fingerprint = new Fingerprint().with(TbdFingerprinterRegistration)
        .withListener(tbdFingerprintListener);

    const build = new Build("mkdocs build")
        .with(mkdocsBuilderRegistration());

    const codeInspection = new AutoCodeInspection();
    codeInspection.with(inspectReferences)
        .withListener(slackReviewListenerRegistration());

    const strictMkdocsBuild = goal(
        { displayName: "mkdocs strict" },
        executeMkdocsStrict);

    const htmltest = goal(
        {
            displayName: "htmltest",
            uniqueName: "customHtmltestGoal",
        },
        executeHtmlproof,
        { logInterpreter: htmltestLogInterpreter })
        .withProjectListener(MkdocsBuildAfterCheckout);

    const publish = new PublishToS3({
        uniqueName: "publish draft to s3",
        bucketName: "docs-sdm.atomist.com",
        region: "us-west-2",
        filesToPublish: ["site/**/*"],
        pathTranslation: (filepath, inv) => inv.id.sha + "/" + filepath.replace("site/", ""),
        pathToIndex: "site/index.html",
        linkLabel: "Check it out!",
    }).withProjectListener(MkdocsBuildAfterCheckout);

    const mkDocsGoals = goals("mkdocs")
        .plan(autofix, fingerprint, codeInspection)
        .plan(build).after(autofix)
        .plan(strictMkdocsBuild).after(build)
        .plan(publish).after(build)
        .plan(htmltest).after(publish);

    const reallyPublishGoal = new PublishToS3({
        uniqueName: "publish site to s3",
        preApprovalRequired: true,
        bucketName: "docs.atomist.com",
        region: "us-east-1",
        filesToPublish: ["site/**/*"],
        pathTranslation: filepath => filepath.replace("site/", ""),
        pathToIndex: "site/index.html",
        linkLabel: "Live on docs.atomist.com",
    }).withProjectListener(MkdocsBuildAfterCheckout);

    const officialPublish = goals("Release site")
        .plan(reallyPublishGoal).after(strictMkdocsBuild, publish, htmltest);

    sdm.withPushRules(
        whenPushSatisfies(allOf(IsMkdocsProject, not(isMaterialChange({
            extensions: ["html", "js"],
            files: ["mkdocs.yml", ".markdownlint.json"],
            globs: ["docs/**/*"],
        })))).itMeans("Nothing about the markdown changed")
            .setGoals(ImmaterialGoals.andLock()),
        whenPushSatisfies(IsMkdocsProject)
            .setGoals(mkDocsGoals),
        whenPushSatisfies(IsMkdocsProject, ToDefaultBranch)
            .setGoals(officialPublish),
    );

    sdm.addGeneratorCommand(MkdocsSiteGenerator);

    sdm.addExtensionPacks(
        goalStateSupport(),
        githubGoalStatusSupport(),
    );

    sdm.addEvent(CreateCodeSnippetInlineJobOnPushToSamples);

    return sdm;
}

const IsMkdocsProject: PushTest = {
    name: "IsMkdocsProject",
    mapping: inv => inv.project.hasFile("mkdocs.yml"),
};
